from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_runtime import StepTrace, drive_loop, resolve_skills
from app.agent_catalog import sync_agent_catalog
from app.auth.deps import current_user, require_role
from app.db import get_db
from app.llm_store import default_agent_model
from app.events import publish
from app.models import Agent, AgentPreset, AgentRun, AgentRunState, Approval, ApprovalState, AuditLog, Device, User
from app.push import send_push

router = APIRouter(prefix="/v1/agents", tags=["agents"])


class AgentOut(BaseModel):
    id: str
    name: str
    system_prompt: str
    model: str | None = None
    skills: list[str]
    enabled: bool
    source: str


class AgentIn(BaseModel):
    name: str = Field(min_length=1)
    system_prompt: str = Field(min_length=1)
    model: str | None = None
    skills: list[str] = Field(default_factory=list)
    enabled: bool = True


class AgentRunIn(BaseModel):
    message: str = Field(min_length=1)
    model: str | None = None
    max_steps: int = Field(default=6, ge=1, le=20)
    skill_overrides: list[str] | None = None


class AgentPresetOut(BaseModel):
    id: str
    label: str
    system_prompt: str
    model: str | None = None
    skills: list[str]
    enabled: bool
    created_at: str


class AgentPresetIn(BaseModel):
    label: str = Field(min_length=1)
    system_prompt: str = Field(min_length=1)
    model: str | None = None
    skills: list[str] = Field(default_factory=list)
    enabled: bool = True


class AgentPresetBundleIn(BaseModel):
    overwrite: bool = True
    presets: list[AgentPresetIn] = Field(default_factory=list)


class AgentPresetBundleOut(BaseModel):
    name: str
    presets: list[AgentPresetOut]


async def _get_agent(db: AsyncSession, name: str) -> Agent | None:
    return (await db.execute(select(Agent).where(Agent.name == name))).scalar_one_or_none()


async def _get_preset(db: AsyncSession, agent_id, label: str) -> AgentPreset | None:
    return (await db.execute(
        select(AgentPreset).where(AgentPreset.agent_id == agent_id, AgentPreset.label == label)
    )).scalar_one_or_none()


@router.get("", response_model=list[AgentOut])
async def list_agents(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> list[AgentOut]:
    await sync_agent_catalog(db)
    rows = (await db.execute(select(Agent).order_by(Agent.created_at.desc()))).scalars().all()
    return [
        AgentOut(
            id=str(row.id),
            name=row.name,
            system_prompt=row.system_prompt,
            model=row.model,
            skills=list(row.skills or []),
            enabled=bool(row.enabled),
            source=row.source,
        )
        for row in rows
    ]


@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
async def create_agent(
    body: AgentIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> AgentOut:
    existing = await _get_agent(db, body.name)
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "agent already exists")
    agent = Agent(
        name=body.name,
        system_prompt=body.system_prompt,
        model=body.model or default_agent_model(),
        skills=body.skills,
        enabled=body.enabled,
        source="manual",
        created_by=user.id,
    )
    db.add(agent)
    db.add(AuditLog(actor_id=user.id, action="agent.create", target_kind="agent", target_id=body.name))
    await db.commit()
    await db.refresh(agent)
    return AgentOut(
        id=str(agent.id),
        name=agent.name,
        system_prompt=agent.system_prompt,
        model=agent.model,
        skills=list(agent.skills or []),
        enabled=bool(agent.enabled),
        source=agent.source,
    )


@router.put("/{name}", response_model=AgentOut)
async def update_agent(
    name: str,
    body: AgentIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> AgentOut:
    agent = await _get_agent(db, name)
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    agent.name = body.name
    agent.system_prompt = body.system_prompt
    agent.model = body.model or agent.model or default_agent_model()
    agent.skills = body.skills
    agent.enabled = body.enabled
    if agent.source != "preset":
        agent.source = "manual"
    db.add(AuditLog(actor_id=user.id, action="agent.update", target_kind="agent", target_id=name))
    await db.commit()
    await db.refresh(agent)
    return AgentOut(
        id=str(agent.id),
        name=agent.name,
        system_prompt=agent.system_prompt,
        model=agent.model,
        skills=list(agent.skills or []),
        enabled=bool(agent.enabled),
        source=agent.source,
    )


@router.patch("/{name}", response_model=AgentOut)
async def patch_agent(
    name: str,
    body: dict,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> AgentOut:
    agent = await _get_agent(db, name)
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    if "enabled" in body:
        agent.enabled = bool(body["enabled"])
    db.add(AuditLog(actor_id=user.id, action="agent.toggle", target_kind="agent", target_id=name))
    await db.commit()
    await db.refresh(agent)
    return AgentOut(
        id=str(agent.id),
        name=agent.name,
        system_prompt=agent.system_prompt,
        model=agent.model,
        skills=list(agent.skills or []),
        enabled=bool(agent.enabled),
        source=agent.source,
    )


@router.delete("/{name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> None:
    agent = await _get_agent(db, name)
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    if agent.source == "preset":
        raise HTTPException(status.HTTP_409_CONFLICT, "preset agents cannot be deleted")
    await db.delete(agent)
    db.add(AuditLog(actor_id=user.id, action="agent.delete", target_kind="agent", target_id=name))
    await db.commit()


@router.get("/{name}/presets", response_model=list[AgentPresetOut])
async def list_agent_presets(
    name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> list[AgentPresetOut]:
    agent = await _get_agent(db, name)
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    rows = (await db.execute(
        select(AgentPreset).where(AgentPreset.agent_id == agent.id).order_by(AgentPreset.updated_at.desc())
    )).scalars().all()
    return [
        AgentPresetOut(
            id=str(row.id),
            label=row.label,
            system_prompt=row.system_prompt,
            model=row.model,
            skills=list(row.skills or []),
            enabled=bool(row.enabled),
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]


@router.get("/{name}/presets/export", response_model=AgentPresetBundleOut)
async def export_agent_presets(
    name: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> AgentPresetBundleOut:
    agent = await _get_agent(db, name)
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    rows = (await db.execute(
        select(AgentPreset).where(AgentPreset.agent_id == agent.id).order_by(AgentPreset.updated_at.desc())
    )).scalars().all()
    return AgentPresetBundleOut(
        name=agent.name,
        presets=[
            AgentPresetOut(
                id=str(row.id),
                label=row.label,
                system_prompt=row.system_prompt,
                model=row.model,
                skills=list(row.skills or []),
                enabled=bool(row.enabled),
                created_at=row.created_at.isoformat(),
            )
            for row in rows
        ],
    )


@router.put("/{name}/presets/{label}", response_model=AgentPresetOut)
async def save_agent_preset(
    name: str,
    label: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> AgentPresetOut:
    label = label.strip()
    if not label:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "preset label required")
    agent = await _get_agent(db, name)
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    preset = await _get_preset(db, agent.id, label)
    if not preset:
        preset = AgentPreset(agent_id=agent.id, label=label, created_by=user.id)
        db.add(preset)
    preset.system_prompt = agent.system_prompt
    preset.model = agent.model
    preset.skills = list(agent.skills or [])
    preset.enabled = bool(agent.enabled)
    db.add(AuditLog(actor_id=user.id, action="agent.preset.save", target_kind="agent_preset", target_id=f"{name}:{label}"))
    await db.commit()
    await db.refresh(preset)
    return AgentPresetOut(
        id=str(preset.id),
        label=preset.label,
        system_prompt=preset.system_prompt,
        model=preset.model,
        skills=list(preset.skills or []),
        enabled=bool(preset.enabled),
        created_at=preset.created_at.isoformat(),
    )


@router.post("/{name}/presets/import", response_model=AgentPresetBundleOut)
async def import_agent_presets(
    name: str,
    body: AgentPresetBundleIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> AgentPresetBundleOut:
    agent = await _get_agent(db, name)
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    imported: list[AgentPresetOut] = []
    for preset_body in body.presets:
        label = preset_body.label.strip()
        if not label:
            continue
        preset = await _get_preset(db, agent.id, label)
        if not preset:
            preset = AgentPreset(agent_id=agent.id, label=label, created_by=user.id)
            db.add(preset)
        elif not body.overwrite:
            continue
        preset.system_prompt = preset_body.system_prompt
        preset.model = preset_body.model
        preset.skills = list(preset_body.skills or [])
        preset.enabled = bool(preset_body.enabled)
        imported.append(
            AgentPresetOut(
                id=str(preset.id),
                label=preset.label,
                system_prompt=preset.system_prompt,
                model=preset.model,
                skills=list(preset.skills or []),
                enabled=bool(preset.enabled),
                created_at=preset.created_at.isoformat() if preset.created_at else "",
            )
        )
    db.add(AuditLog(actor_id=user.id, action="agent.preset.import", target_kind="agent_preset", target_id=name))
    await db.commit()
    return AgentPresetBundleOut(name=agent.name, presets=imported)


@router.post("/{name}/presets/{label}/apply", response_model=AgentOut)
async def apply_agent_preset(
    name: str,
    label: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> AgentOut:
    label = label.strip()
    agent = await _get_agent(db, name)
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    preset = await _get_preset(db, agent.id, label)
    if not preset:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "preset not found")
    agent.system_prompt = preset.system_prompt
    agent.model = preset.model or agent.model or default_agent_model()
    agent.skills = list(preset.skills or [])
    agent.enabled = bool(preset.enabled)
    db.add(AuditLog(actor_id=user.id, action="agent.preset.apply", target_kind="agent_preset", target_id=f"{name}:{label}"))
    await db.commit()
    await db.refresh(agent)
    return AgentOut(
        id=str(agent.id),
        name=agent.name,
        system_prompt=agent.system_prompt,
        model=agent.model,
        skills=list(agent.skills or []),
        enabled=bool(agent.enabled),
        source=agent.source,
    )


@router.delete("/{name}/presets/{label}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent_preset(
    name: str,
    label: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> None:
    label = label.strip()
    agent = await _get_agent(db, name)
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    preset = await _get_preset(db, agent.id, label)
    if not preset:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "preset not found")
    await db.delete(preset)
    db.add(AuditLog(actor_id=user.id, action="agent.preset.delete", target_kind="agent_preset", target_id=f"{name}:{label}"))
    await db.commit()


def _state_from_stop(stop_reason: str) -> AgentRunState:
    if stop_reason == "completed":
        return AgentRunState.completed
    if stop_reason == "approval_required":
        return AgentRunState.waiting_approval
    if stop_reason.startswith("unknown agent"):
        return AgentRunState.failed
    if stop_reason == "max_steps":
        return AgentRunState.failed
    return AgentRunState.failed


@router.post("/{name}/run")
async def run_(
    name: str,
    body: AgentRunIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> dict:
    agent = await _get_agent(db, name)
    if not agent:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    if not agent.enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "agent disabled")

    prompt, allowed = resolve_skills(
        agent.name,
        skill_overrides=body.skill_overrides,
        system_prompt=agent.system_prompt,
        skill_names=list(agent.skills or []),
    )
    messages: list[dict] = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": body.message},
    ]
    trace: list[StepTrace] = []

    model = body.model or agent.model or default_agent_model()
    run = AgentRun(
        agent_name=agent.name,
        user_id=user.id,
        model=model,
        initial_message=body.message,
        state=AgentRunState.running,
        messages=messages,
        steps=[],
        skills=allowed,
        max_steps=body.max_steps,
    )
    db.add(run)
    await db.flush()

    try:
        result = await drive_loop(messages, allowed, model=model, max_steps=body.max_steps, trace=trace)
    except Exception as exc:
        run.state = AgentRunState.failed
        run.stop_reason = "exception"
        run.error = str(exc)[:2000]
        run.messages = messages
        run.steps = [{"tool": s.tool, "arguments": s.arguments, "result": s.result, "error": s.error} for s in trace]
        db.add(AuditLog(
            actor_id=user.id,
            action=f"agent.run_failed:{agent.name}",
            target_kind="agent_run",
            target_id=str(run.id),
            metadata_json={"error": str(exc)[:500]},
        ))
        await db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"agent run failed: {exc}")

    run.state = _state_from_stop(result.stop_reason)
    run.stop_reason = result.stop_reason
    run.messages = messages
    run.steps = [{"tool": s.tool, "arguments": s.arguments, "result": s.result, "error": s.error} for s in trace]
    run.pending_tool = result.pending_tool
    run.output = result.output or None

    if result.stop_reason == "approval_required" and result.pending_tool:
        pt = result.pending_tool
        db.add(Approval(
            agent_run_id=run.id,
            tool_call_id=pt.get("tool_call_id"),
            tool=pt.get("tool"),
            action=f"agent.tool:{pt.get('skill')}",
            risk="high",
            payload={"agent_run_id": str(run.id), "skill": pt.get("skill"), "arguments": pt.get("arguments")},
        ))

    db.add(AuditLog(
        actor_id=user.id,
        action=f"agent.run:{agent.name}",
        target_kind="agent_run",
        target_id=str(run.id),
        metadata_json={"stop_reason": result.stop_reason, "steps": len(result.steps)},
    ))
    await db.commit()
    await db.refresh(run)
    await publish("agent_run.updated", {"id": str(run.id), "state": run.state.value, "stop_reason": run.stop_reason})
    if run.state == AgentRunState.waiting_approval:
        await publish("approval.created", {"agent_run_id": str(run.id)})
        # Push to user's mobile devices. Best-effort.
        device_rows = (await db.execute(select(Device).where(Device.user_id == user.id))).scalars().all()
        tokens = [d.push_token for d in device_rows]
        if tokens and result.pending_tool:
            pt = result.pending_tool
            await send_push(
                tokens,
                title="Approval needed",
                body=f"{agent.name}: {pt.get('skill', pt.get('tool', 'tool'))}",
                data={"type": "approval", "agent_run_id": str(run.id), "tool": pt.get("tool")},
            )
    payload = result.to_dict()
    payload["run_id"] = str(run.id)
    payload["state"] = run.state.value
    return payload
