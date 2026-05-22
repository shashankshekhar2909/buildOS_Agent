from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user, require_role
from app.db import get_db
from app.dispatcher import dispatch
from app.events import publish
from app.models import AuditLog, Skill, TaskState, User
from app.schemas import SkillCreateIn, SkillOut, SkillPatchIn, SkillRunIn, SkillUpdateIn, TaskOut
from app.skill_tasks import build_skill_task
from app.skill_loader import sync_skill_catalog

router = APIRouter(prefix="/v1/skills", tags=["skills"])


@router.get("", response_model=list[SkillOut])
async def list_skills(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> list[SkillOut]:
    await sync_skill_catalog(db)
    rows = (await db.execute(select(Skill).order_by(Skill.name.asc()))).scalars().all()
    return [SkillOut.model_validate(row) for row in rows]


@router.get("/{skill_id}", response_model=SkillOut)
async def get_skill(
    skill_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> SkillOut:
    skill = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    return SkillOut.model_validate(skill)


@router.patch("/{skill_id}", response_model=SkillOut)
async def patch_skill(
    skill_id: str,
    body: SkillPatchIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> SkillOut:
    skill = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    skill.enabled = body.enabled
    db.add(
        AuditLog(
            actor_id=user.id,
            action="skill.enable" if body.enabled else "skill.disable",
            target_kind="skill",
            target_id=skill.name,
            metadata_json={"skill_id": str(skill.id)},
        )
    )
    await db.commit()
    await db.refresh(skill)
    return SkillOut.model_validate(skill)


@router.post("", response_model=SkillOut, status_code=status.HTTP_201_CREATED)
async def create_skill(
    body: SkillCreateIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> SkillOut:
    existing = (await db.execute(select(Skill).where(Skill.name == body.name))).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "skill already exists")
    skill = Skill(
        name=body.name,
        version=body.version,
        description=body.description,
        permissions=body.permissions,
        requires_approval=body.requires_approval,
        enabled=body.enabled,
        manifest={
            **body.manifest,
            "permissions": body.permissions,
            "requires_approval": body.requires_approval,
            "source": "manual",
        },
    )
    db.add(skill)
    db.add(AuditLog(actor_id=user.id, action="skill.create", target_kind="skill", target_id=body.name))
    await db.commit()
    await db.refresh(skill)
    return SkillOut.model_validate(skill)


@router.put("/{skill_id}", response_model=SkillOut)
async def update_skill(
    skill_id: str,
    body: SkillUpdateIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> SkillOut:
    skill = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    conflict = (
        await db.execute(select(Skill).where(Skill.name == body.name, Skill.id != skill_id))
    ).scalar_one_or_none()
    if conflict:
        raise HTTPException(status.HTTP_409_CONFLICT, "skill name already exists")
    skill.name = body.name
    skill.version = body.version
    skill.description = body.description
    skill.permissions = body.permissions
    skill.requires_approval = body.requires_approval
    skill.enabled = body.enabled
    skill.manifest = {
        **body.manifest,
        "permissions": body.permissions,
        "requires_approval": body.requires_approval,
        "source": skill.manifest.get("source", "manual"),
    }
    db.add(AuditLog(actor_id=user.id, action="skill.update", target_kind="skill", target_id=skill.name))
    await db.commit()
    await db.refresh(skill)
    return SkillOut.model_validate(skill)


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(
    skill_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> None:
    skill = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    await db.delete(skill)
    db.add(AuditLog(actor_id=user.id, action="skill.delete", target_kind="skill", target_id=skill.name))
    await db.commit()


@router.post("/{skill_id}/run", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def run_skill(
    skill_id: str,
    body: SkillRunIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> TaskOut:
    skill = (await db.execute(select(Skill).where(Skill.id == skill_id))).scalar_one_or_none()
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    task = await build_skill_task(
        db,
        user,
        title=f"Run skill: {skill.name}",
        payload={"name": skill.name, "payload": body.payload},
    )
    db.add(AuditLog(actor_id=user.id, action="skill.run", target_kind="skill", target_id=skill.name, metadata_json={"task_id": str(task.id)}))
    await db.commit()
    await db.refresh(task)
    await publish("task.created", {"id": str(task.id), "kind": task.kind, "state": task.state.value})
    if task.state == TaskState.queued:
        await dispatch(db, task)
    return TaskOut.model_validate(task)
