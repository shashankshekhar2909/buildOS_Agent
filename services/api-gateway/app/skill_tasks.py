from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Approval, Skill, SkillGrant, Task, TaskState, User
from app.skill_runtime import normalize_payload
from app.task_schedule import should_delay


async def build_skill_task(
    db: AsyncSession,
    user: User,
    *,
    title: str,
    payload: dict[str, Any],
    node_id: str | None = None,
    scheduled_at=None,
) -> Task:
    skill_name, skill_payload = normalize_payload(payload)
    skill = (await db.execute(select(Skill).where(Skill.name == skill_name))).scalar_one_or_none()
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    if not skill.enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "skill disabled")
    if user.role != "admin":
        granted = (
            await db.execute(
                select(SkillGrant).where(SkillGrant.user_id == user.id, SkillGrant.skill_name == skill_name)
            )
        ).scalar_one_or_none()
        if not granted:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"no grant for skill '{skill_name}'")

    stored_payload = dict(payload)
    stored_payload["name"] = skill_name
    stored_payload["payload"] = skill_payload

    task = Task(
        title=title,
        kind="skill",
        payload=stored_payload,
        node_id=node_id,
        scheduled_at=scheduled_at,
        created_by=user.id,
        state=TaskState.waiting_approval if skill.requires_approval else (TaskState.pending if should_delay(scheduled_at) else TaskState.queued),
    )
    db.add(task)
    await db.flush()
    if skill.requires_approval:
        db.add(
            Approval(
                task_id=task.id,
                action=skill_name,
                risk=str(skill.manifest.get("risk", "medium")),
                payload=task.payload,
            )
        )
    return task
