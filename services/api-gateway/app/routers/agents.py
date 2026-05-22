from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_runtime import AGENT_PRESETS, list_agents, run_agent
from app.auth.deps import current_user, require_role
from app.db import get_db
from app.models import AuditLog, User

router = APIRouter(prefix="/v1/agents", tags=["agents"])


class AgentInfo(BaseModel):
    name: str
    system_prompt: str
    skills: list[str]


class AgentRunIn(BaseModel):
    message: str = Field(min_length=1)
    model: str = "claude-sonnet"
    max_steps: int = Field(default=6, ge=1, le=20)
    skill_overrides: list[str] | None = None


@router.get("", response_model=list[AgentInfo])
async def list_(
    _user: Annotated[User, Depends(current_user)],
) -> list[AgentInfo]:
    return [AgentInfo(**a) for a in list_agents()]


@router.post("/{name}/run")
async def run_(
    name: str,
    body: AgentRunIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> dict:
    if name not in AGENT_PRESETS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent not found")
    try:
        result = await run_agent(
            name,
            body.message,
            model=body.model,
            max_steps=body.max_steps,
            skill_overrides=body.skill_overrides,
        )
    except Exception as exc:
        db.add(AuditLog(
            actor_id=user.id,
            action=f"agent.run_failed:{name}",
            target_kind="agent",
            target_id=name,
            metadata_json={"error": str(exc)[:500]},
        ))
        await db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"agent run failed: {exc}")
    db.add(AuditLog(
        actor_id=user.id,
        action=f"agent.run:{name}",
        target_kind="agent",
        target_id=name,
        metadata_json={"stop_reason": result.stop_reason, "steps": len(result.steps)},
    ))
    await db.commit()
    return result.to_dict()
