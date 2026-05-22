from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_role
from app.db import get_db
from app.models import AuditLog, SkillGrant, User

router = APIRouter(prefix="/v1/grants", tags=["grants"])


class GrantIn(BaseModel):
    user_id: str
    skill_name: str


class GrantOut(BaseModel):
    id: str
    user_id: str
    skill_name: str


@router.get("/skills/{user_id}", response_model=list[str])
async def list_user_skills(
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> list[str]:
    rows = (await db.execute(select(SkillGrant.skill_name).where(SkillGrant.user_id == user_id))).scalars().all()
    return list(rows)


@router.post("", response_model=GrantOut, status_code=status.HTTP_201_CREATED)
async def grant(
    body: GrantIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> GrantOut:
    existing = (
        await db.execute(select(SkillGrant).where(SkillGrant.user_id == body.user_id, SkillGrant.skill_name == body.skill_name))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "already granted")
    g = SkillGrant(user_id=body.user_id, skill_name=body.skill_name, granted_by=user.id)
    db.add(g)
    db.add(AuditLog(actor_id=user.id, action="grant.create", target_kind="skill", target_id=body.skill_name, metadata_json={"user_id": body.user_id}))
    await db.commit()
    await db.refresh(g)
    return GrantOut(id=str(g.id), user_id=str(g.user_id), skill_name=g.skill_name)


@router.delete("/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke(
    grant_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> None:
    g = (await db.execute(select(SkillGrant).where(SkillGrant.id == grant_id))).scalar_one_or_none()
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "grant not found")
    await db.delete(g)
    db.add(AuditLog(actor_id=user.id, action="grant.revoke", target_kind="skill", target_id=g.skill_name))
    await db.commit()
