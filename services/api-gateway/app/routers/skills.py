from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user, require_role
from app.db import get_db
from app.dispatcher import dispatch
from app.events import publish
from app.models import AuditLog, Skill, SkillPreset, TaskState, User
from app.schemas import SkillCreateIn, SkillOut, SkillPatchIn, SkillRunIn, SkillUpdateIn, TaskOut
from app.skill_tasks import build_skill_task
from app.skill_loader import sync_skill_catalog

router = APIRouter(prefix="/v1/skills", tags=["skills"])


class SkillPresetOut(SkillOut):
    label: str


class SkillPresetCreateIn(SkillUpdateIn):
    label: str


class SkillPresetIn(BaseModel):
    label: str = Field(min_length=1)
    version: str
    description: str
    permissions: list[str]
    requires_approval: bool
    enabled: bool
    manifest: dict = Field(default_factory=dict)


class SkillPresetBundleIn(BaseModel):
    overwrite: bool = True
    presets: list[SkillPresetIn] = Field(default_factory=list)


class SkillPresetBundleOut(BaseModel):
    name: str
    presets: list[SkillPresetOut]


async def _lookup_skill(db: AsyncSession, key: str):
    """Resolve a skill by UUID id or by name."""
    try:
        uid = UUID(key)
        row = (await db.execute(select(Skill).where(Skill.id == uid))).scalar_one_or_none()
        if row:
            return row
    except ValueError:
        pass
    return (await db.execute(select(Skill).where(Skill.name == key))).scalar_one_or_none()


async def _lookup_preset(db: AsyncSession, skill_id: UUID, label: str):
    return (await db.execute(
        select(SkillPreset).where(SkillPreset.skill_id == skill_id, SkillPreset.label == label)
    )).scalar_one_or_none()


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
    skill = await _lookup_skill(db, skill_id)
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    return SkillOut.model_validate(skill)


@router.get("/{skill_id}/presets", response_model=list[SkillPresetOut])
async def list_skill_presets(
    skill_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> list[SkillPresetOut]:
    skill = await _lookup_skill(db, skill_id)
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    rows = (await db.execute(
        select(SkillPreset).where(SkillPreset.skill_id == skill.id).order_by(SkillPreset.updated_at.desc())
    )).scalars().all()
    return [
        SkillPresetOut(
            id=str(row.id),
            name=skill.name,
            version=row.version,
            description=row.description,
            permissions=list(row.permissions or []),
            requires_approval=bool(row.requires_approval),
            enabled=bool(row.enabled),
            manifest=row.manifest or {},
            label=row.label,
        )
        for row in rows
    ]


@router.get("/{skill_id}/presets/export", response_model=SkillPresetBundleOut)
async def export_skill_presets(
    skill_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> SkillPresetBundleOut:
    skill = await _lookup_skill(db, skill_id)
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    rows = (await db.execute(
        select(SkillPreset).where(SkillPreset.skill_id == skill.id).order_by(SkillPreset.updated_at.desc())
    )).scalars().all()
    return SkillPresetBundleOut(
        name=skill.name,
        presets=[
            SkillPresetOut(
                id=str(row.id),
                name=skill.name,
                version=row.version,
                description=row.description,
                permissions=list(row.permissions or []),
                requires_approval=bool(row.requires_approval),
                enabled=bool(row.enabled),
                manifest=row.manifest or {},
                label=row.label,
            )
            for row in rows
        ],
    )


@router.put("/{skill_id}/presets/{label}", response_model=SkillPresetOut)
async def save_skill_preset(
    skill_id: str,
    label: str,
    body: SkillPresetCreateIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> SkillPresetOut:
    skill = await _lookup_skill(db, skill_id)
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    label = label.strip()
    if not label:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "preset label required")
    preset = await _lookup_preset(db, skill.id, label)
    if not preset:
        preset = SkillPreset(skill_id=skill.id, label=label)
        db.add(preset)
    preset.version = body.version
    preset.description = body.description
    preset.permissions = body.permissions
    preset.requires_approval = body.requires_approval
    preset.enabled = body.enabled
    preset.manifest = {
        **body.manifest,
        "permissions": body.permissions,
        "requires_approval": body.requires_approval,
        "source": body.manifest.get("source", "manual"),
    }
    db.add(AuditLog(actor_id=user.id, action="skill.preset.save", target_kind="skill_preset", target_id=f"{skill.name}:{label}"))
    await db.commit()
    await db.refresh(preset)
    return SkillPresetOut(
        id=str(preset.id),
        name=skill.name,
        version=preset.version,
        description=preset.description,
        permissions=list(preset.permissions or []),
        requires_approval=bool(preset.requires_approval),
        enabled=bool(preset.enabled),
        manifest=preset.manifest or {},
        label=preset.label,
    )


@router.post("/{skill_id}/presets/import", response_model=SkillPresetBundleOut)
async def import_skill_presets(
    skill_id: str,
    body: SkillPresetBundleIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> SkillPresetBundleOut:
    skill = await _lookup_skill(db, skill_id)
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    imported: list[SkillPresetOut] = []
    for preset_body in body.presets:
        label = preset_body.label.strip()
        if not label:
            continue
        preset = await _lookup_preset(db, skill.id, label)
        if not preset:
            preset = SkillPreset(skill_id=skill.id, label=label)
            db.add(preset)
        elif not body.overwrite:
            continue
        preset.version = preset_body.version
        preset.description = preset_body.description
        preset.permissions = list(preset_body.permissions or [])
        preset.requires_approval = bool(preset_body.requires_approval)
        preset.enabled = bool(preset_body.enabled)
        preset.manifest = {
            **preset_body.manifest,
            "permissions": preset_body.permissions,
            "requires_approval": preset_body.requires_approval,
            "source": preset_body.manifest.get("source", "manual"),
        }
        imported.append(
            SkillPresetOut(
                id=str(preset.id),
                name=skill.name,
                version=preset.version,
                description=preset.description,
                permissions=list(preset.permissions or []),
                requires_approval=bool(preset.requires_approval),
                enabled=bool(preset.enabled),
                manifest=preset.manifest or {},
                label=preset.label,
            )
        )
    db.add(AuditLog(actor_id=user.id, action="skill.preset.import", target_kind="skill_preset", target_id=skill.name))
    await db.commit()
    return SkillPresetBundleOut(name=skill.name, presets=imported)


@router.post("/{skill_id}/presets/{label}/apply", response_model=SkillOut)
async def apply_skill_preset(
    skill_id: str,
    label: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> SkillOut:
    skill = await _lookup_skill(db, skill_id)
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    preset = await _lookup_preset(db, skill.id, label.strip())
    if not preset:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "preset not found")
    skill.version = preset.version
    skill.description = preset.description
    skill.permissions = list(preset.permissions or [])
    skill.requires_approval = bool(preset.requires_approval)
    skill.enabled = bool(preset.enabled)
    skill.manifest = {
        **(preset.manifest or {}),
        "permissions": preset.permissions,
        "requires_approval": preset.requires_approval,
        "source": skill.manifest.get("source", "manual"),
    }
    db.add(AuditLog(actor_id=user.id, action="skill.preset.apply", target_kind="skill_preset", target_id=f"{skill.name}:{label}"))
    await db.commit()
    await db.refresh(skill)
    return SkillOut.model_validate(skill)


@router.delete("/{skill_id}/presets/{label}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill_preset(
    skill_id: str,
    label: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> None:
    skill = await _lookup_skill(db, skill_id)
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    preset = await _lookup_preset(db, skill.id, label.strip())
    if not preset:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "preset not found")
    await db.delete(preset)
    db.add(AuditLog(actor_id=user.id, action="skill.preset.delete", target_kind="skill_preset", target_id=f"{skill.name}:{label}"))
    await db.commit()


@router.patch("/{skill_id}", response_model=SkillOut)
async def patch_skill(
    skill_id: str,
    body: SkillPatchIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> SkillOut:
    skill = await _lookup_skill(db, skill_id)
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
    skill = await _lookup_skill(db, skill_id)
    if not skill:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "skill not found")
    conflict = (
        await db.execute(select(Skill).where(Skill.name == body.name, Skill.id != skill.id))
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
    skill = await _lookup_skill(db, skill_id)
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
    skill = await _lookup_skill(db, skill_id)
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
