"""Task dispatcher. Pushes ready tasks to their target node via WS.

Called inline from routers when a task becomes queued (direct create of a
non-dangerous kind, or after an approval is approved). Real production would
move this to a dedicated worker subscribed to redis events; for the single
deployable API service this in-process dispatch is sufficient.
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_runtime import StepTrace, drive_loop, resolve_skills
from app.connector_store import get_user_secret
from app.events import publish
from app.llm_store import default_agent_model
from app.models import AgentRun, AgentRunState, Approval, Project, Task, TaskState
from app.node_store import get_node_ssh_payload
from app.skill_runtime import normalize_payload, run_skill
from app.task_recurrence import spawn_repeat_task
from app.ws.manager import manager


async def dispatch(db: AsyncSession, task: Task) -> None:
    if task.state != TaskState.queued:
        return
    if task.kind == "agent":
        await _run_agent_task(db, task)
        return
    if task.kind != "command":
        if task.kind != "skill":
            # Other kinds (workflow) handled elsewhere for now.
            return
        if not isinstance(task.payload, dict):
            task.state = TaskState.failed
            task.error = "invalid payload"
            task.finished_at = datetime.now(tz=timezone.utc)
            await db.commit()
            return
        try:
            skill_name, skill_payload = normalize_payload(task.payload)
        except ValueError as exc:
            task.state = TaskState.failed
            task.error = str(exc)
            task.finished_at = datetime.now(tz=timezone.utc)
            await db.commit()
            return

        if skill_name in {"telegram", "slack"} and task.created_by:
            user_secret = await get_user_secret(db, task.created_by, skill_name)
            if user_secret:
                merged = dict(skill_payload)
                merged.setdefault("bot_token", user_secret.get("bot_token"))
                if skill_name == "telegram" and not merged.get("chat_id") and user_secret.get("default_chat_id"):
                    merged["chat_id"] = user_secret.get("default_chat_id")
                if skill_name == "slack" and not merged.get("channel_id") and user_secret.get("default_channel_id"):
                    merged["channel_id"] = user_secret.get("default_channel_id")
                skill_payload = merged
        if skill_name == "ssh":
            node_id = skill_payload.get("node_id")
            if node_id:
                try:
                    node_payload = await get_node_ssh_payload(db, node_id)
                except Exception:
                    node_payload = None
                if node_payload:
                    merged = dict(node_payload)
                    merged.update({k: v for k, v in skill_payload.items() if v not in (None, "")})
                    skill_payload = merged

        task.state = TaskState.running
        task.started_at = datetime.now(tz=timezone.utc)
        await db.commit()
        await manager.broadcast_clients({"event": "task.started", "data": {"task_id": str(task.id), "kind": "skill", "skill": skill_name}})
        await publish("task.started", {"task_id": str(task.id), "kind": "skill", "skill": skill_name})

        result = await run_skill(skill_name, skill_payload)
        ok = bool(result.get("ok", True))
        task.state = TaskState.completed if ok else TaskState.failed
        task.result = {"skill": skill_name, **result}
        task.error = None if ok else (result.get("error") or "failed")
        task.finished_at = datetime.now(tz=timezone.utc)
        await db.commit()
        payload = {"task_id": str(task.id), "skill": skill_name, **result}
        await manager.broadcast_clients({"event": "task.result", "data": payload})
        await publish("task.result", payload)
        await spawn_repeat_task(db, task)
        return
    if not task.node_id:
        task.state = TaskState.failed
        task.error = "no node assigned"
        task.finished_at = datetime.now(tz=timezone.utc)
        await db.commit()
        return

    cmd = task.payload.get("cmd") if isinstance(task.payload, dict) else None
    if not cmd or not isinstance(cmd, list):
        task.state = TaskState.failed
        task.error = "invalid payload.cmd"
        task.finished_at = datetime.now(tz=timezone.utc)
        await db.commit()
        return

    ok = await manager.send_to_node(
        str(task.node_id),
        {
            "type": "task.exec",
            "task_id": str(task.id),
            "cmd": cmd,
            "approved": True,
            "timeout": task.payload.get("timeout", 60),
        },
    )
    if not ok:
        task.state = TaskState.failed
        task.error = "node offline"
        task.finished_at = datetime.now(tz=timezone.utc)
        await db.commit()
        return

    task.state = TaskState.running
    task.started_at = datetime.now(tz=timezone.utc)
    await db.commit()


async def _run_agent_task(db: AsyncSession, task: Task) -> None:
    payload = task.payload if isinstance(task.payload, dict) else {}
    message = str(payload.get("message") or payload.get("prompt") or "").strip()
    if not message:
        task.state = TaskState.failed
        task.error = "agent requires message"
        task.finished_at = datetime.now(tz=timezone.utc)
        await db.commit()
        return

    agent_name = str(payload.get("agent_name") or payload.get("agent") or "core").strip() or "core"
    model = str(payload.get("model") or default_agent_model()).strip() or default_agent_model()
    skill_overrides = payload.get("skill_overrides")
    if not isinstance(skill_overrides, list):
        skill_overrides = None
    system_prompt = payload.get("system_prompt")
    skill_names = payload.get("skill_names")
    if not isinstance(skill_names, list):
        skill_names = None
    max_steps = max(1, min(int(payload.get("max_steps") or 6), 12))

    prompt, allowed = resolve_skills(
        agent_name,
        skill_overrides=skill_overrides,
        system_prompt=str(system_prompt) if system_prompt is not None else None,
        skill_names=skill_names,
    )
    messages: list[dict] = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": message},
    ]
    trace: list[StepTrace] = []

    run = AgentRun(
        agent_name=agent_name,
        user_id=task.created_by,
        model=model,
        initial_message=message,
        state=AgentRunState.running,
        messages=messages,
        steps=[],
        skills=allowed,
        max_steps=max_steps,
    )
    db.add(run)
    await db.flush()
    task.agent_run_id = run.id
    task.state = TaskState.running
    task.started_at = datetime.now(tz=timezone.utc)
    await db.commit()
    await manager.broadcast_clients({"event": "task.started", "data": {"task_id": str(task.id), "kind": "agent", "agent": agent_name}})
    await publish("task.started", {"task_id": str(task.id), "kind": "agent", "agent": agent_name})

    try:
        result = await drive_loop(messages, allowed, model=model, max_steps=max_steps, trace=trace)
    except Exception as exc:
        run.state = AgentRunState.failed
        run.stop_reason = "exception"
        run.error = str(exc)[:2000]
        run.messages = messages
        run.steps = [{"tool": s.tool, "arguments": s.arguments, "result": s.result, "error": s.error} for s in trace]
        task.state = TaskState.failed
        task.error = str(exc)[:2000]
        task.result = {"agent": agent_name, "ok": False, "error": str(exc)}
        task.finished_at = datetime.now(tz=timezone.utc)
        await _sync_project_status(db, task, "failed")
        await db.commit()
        return

    run.messages = messages
    run.steps = [{"tool": s.tool, "arguments": s.arguments, "result": s.result, "error": s.error} for s in trace]
    run.stop_reason = result.stop_reason
    run.output = result.output or None
    run.pending_tool = result.pending_tool

    task.result = {"agent": agent_name, **result.to_dict()}
    if result.stop_reason == "completed":
        run.state = AgentRunState.completed
        task.state = TaskState.completed
        task.error = None
        task.finished_at = datetime.now(tz=timezone.utc)
        await _sync_project_status(db, task, "built")
    elif result.stop_reason == "approval_required":
        run.state = AgentRunState.waiting_approval
        task.state = TaskState.waiting_approval
        task.error = "approval required"
        if result.pending_tool:
            pt = result.pending_tool
            db.add(
                Approval(
                    agent_run_id=run.id,
                    tool_call_id=pt.get("tool_call_id"),
                    tool=pt.get("tool"),
                    action=f"agent.tool:{pt.get('skill')}",
                    risk="high",
                    payload={"agent_run_id": str(run.id), "skill": pt.get("skill"), "arguments": pt.get("arguments")},
                )
            )
    else:
        run.state = AgentRunState.failed
        task.state = TaskState.failed
        task.error = result.stop_reason or "failed"
        task.finished_at = datetime.now(tz=timezone.utc)
        await _sync_project_status(db, task, "failed")
    await db.commit()
    payload_out = {"task_id": str(task.id), "kind": "agent", "agent": agent_name, **result.to_dict()}
    await manager.broadcast_clients({"event": "task.result", "data": payload_out})
    await publish("task.result", payload_out)
    await spawn_repeat_task(db, task)


async def _sync_project_status(db: AsyncSession, task: Task, status: str) -> None:
    payload = task.payload if isinstance(task.payload, dict) else {}
    project_id = payload.get("project_id")
    if not project_id:
        return
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if not project:
        return
    project.status = status
