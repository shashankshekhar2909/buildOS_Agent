"""Task dispatcher. Pushes ready tasks to their target node via WS.

Called inline from routers when a task becomes queued (direct create of a
non-dangerous kind, or after an approval is approved). Real production would
move this to a dedicated worker subscribed to redis events; for the single
deployable API service this in-process dispatch is sufficient.
"""
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task, TaskState
from app.ws.manager import manager


async def dispatch(db: AsyncSession, task: Task) -> None:
    if task.state != TaskState.queued:
        return
    if task.kind != "command":
        # Other kinds (skill/agent/workflow) handled by agent-runtime.
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
