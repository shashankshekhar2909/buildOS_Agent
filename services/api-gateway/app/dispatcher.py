"""Task dispatcher. Pushes ready tasks to their target node via WS.

Called inline from routers when a task becomes queued (direct create of a
non-dangerous kind, or after an approval is approved). Real production would
move this to a dedicated worker subscribed to redis events; for the single
deployable API service this in-process dispatch is sufficient.
"""
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task, TaskState
from app.events import publish
from app.node_store import get_node_ssh_payload
from app.connector_store import get_user_secret
from app.skill_runtime import normalize_payload, run_skill
from app.task_recurrence import spawn_repeat_task
from app.ws.manager import manager


async def dispatch(db: AsyncSession, task: Task) -> None:
    if task.state != TaskState.queued:
        return
    if task.kind != "command":
        if task.kind != "skill":
            # Other kinds (agent/workflow) handled elsewhere for now.
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
