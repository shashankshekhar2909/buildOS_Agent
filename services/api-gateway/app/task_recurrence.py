from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task, TaskState, User

REPEAT_MINUTES_KEY = "_repeat_every_minutes"
REPEAT_UNTIL_KEY = "_repeat_until"


def repeat_minutes(payload: dict[str, Any]) -> int | None:
    raw = payload.get(REPEAT_MINUTES_KEY)
    if raw is None:
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def repeat_until(payload: dict[str, Any]) -> datetime | None:
    raw = payload.get(REPEAT_UNTIL_KEY)
    if not raw:
        return None
    try:
        text = str(raw).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def next_run_at(task: Task) -> datetime | None:
    minutes = repeat_minutes(task.payload or {})
    if not minutes:
        return None
    base = task.finished_at or task.started_at or task.scheduled_at or datetime.now(tz=timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    scheduled = base + timedelta(minutes=minutes)
    until = repeat_until(task.payload or {})
    if until and scheduled > until:
        return None
    return scheduled


async def spawn_repeat_task(db: AsyncSession, task: Task) -> Task | None:
    scheduled_at = next_run_at(task)
    if scheduled_at is None:
        return None

    payload = dict(task.payload or {})

    if task.kind == "skill":
        from app.skill_tasks import build_skill_task

        if not task.created_by:
            return None
        user = (await db.execute(select(User).where(User.id == task.created_by))).scalar_one_or_none()
        if not user:
            return None
        next_task = await build_skill_task(
            db,
            user,
            title=task.title,
            payload=payload,
            node_id=str(task.node_id) if task.node_id else None,
            scheduled_at=scheduled_at,
        )
        await db.commit()
        return next_task

    next_task = Task(
        title=task.title,
        kind=task.kind,
        payload=payload,
        node_id=task.node_id,
        parent_id=task.parent_id,
        created_by=task.created_by,
        scheduled_at=scheduled_at,
        state=TaskState.pending if scheduled_at > datetime.now(tz=timezone.utc) else TaskState.queued,
    )
    db.add(next_task)
    await db.flush()
    await db.commit()
    return next_task
