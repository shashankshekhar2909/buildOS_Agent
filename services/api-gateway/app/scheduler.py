from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.dispatcher import dispatch
from app.models import Task, TaskState
from app.task_schedule import is_due


async def _run_once() -> int:
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(Task)
                .where(Task.state == TaskState.pending)
                .order_by(Task.scheduled_at.asc().nullsfirst(), Task.created_at.asc())
                .limit(50)
            )
        ).scalars().all()
        due_tasks: list[Task] = []
        for task in rows:
            if is_due(task.scheduled_at):
                task.state = TaskState.queued
                due_tasks.append(task)
        if not due_tasks:
            await db.commit()
            return 0
        await db.commit()
        for task in due_tasks:
            await dispatch(db, task)
        return len(due_tasks)


async def run_task_scheduler(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await _run_once()
        except Exception:
            # Keep the loop alive; task failures should not kill the API.
            pass
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=3.0)
        except TimeoutError:
            continue
