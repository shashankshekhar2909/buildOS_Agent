from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.auth.jwt import hash_password
from app.db import get_db
from app.models import AuditLog, User
from app.schemas import UserAdminOut, UserCreateIn, UserUpdateIn

router = APIRouter(prefix="/v1/users", tags=["users"])

_VALID_ROLES = {"admin", "operator", "viewer"}


def _ensure_role(role: str) -> str:
    if role not in _VALID_ROLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid role")
    return role


async def _active_admin_count(db: AsyncSession) -> int:
    result = await db.execute(select(func.count()).select_from(User).where(User.role == "admin", User.is_active.is_(True)))
    return int(result.scalar_one())


async def _load_user_or_404(db: AsyncSession, user_id: str) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    return user


@router.get("", response_model=list[UserAdminOut])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_admin())],
) -> list[UserAdminOut]:
    rows = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    return [UserAdminOut.model_validate(row) for row in rows]


@router.post("", response_model=UserAdminOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreateIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_admin())],
) -> UserAdminOut:
    email = body.email.strip().lower()
    exists = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    role = _ensure_role(body.role)
    user = User(email=email, password_hash=hash_password(body.password), role=role, is_active=body.is_active)
    db.add(user)
    db.add(AuditLog(actor_id=actor.id, action="user.create", target_kind="user", target_id=email, metadata_json={"role": role, "is_active": body.is_active}))
    await db.commit()
    await db.refresh(user)
    return UserAdminOut.model_validate(user)


@router.patch("/{user_id}", response_model=UserAdminOut)
async def update_user(
    user_id: str,
    body: UserUpdateIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_admin())],
) -> UserAdminOut:
    user = await _load_user_or_404(db, user_id)
    current_admins = await _active_admin_count(db)
    changing_admin_status = False

    if body.email is not None:
        email = body.email.strip().lower()
        existing = (await db.execute(select(User).where(User.email == email, User.id != user.id))).scalar_one_or_none()
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
        user.email = email
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    if body.role is not None:
        role = _ensure_role(body.role)
        if user.role == "admin" and role != "admin":
            changing_admin_status = True
        user.role = role
    if body.is_active is not None:
        if user.role == "admin" and user.is_active and not body.is_active:
            changing_admin_status = True
        user.is_active = body.is_active

    if user.id == actor.id and (body.role is not None or body.is_active is not None):
        if body.role is not None and body.role != actor.role:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot change own role")
        if body.is_active is False:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot disable own account")

    if changing_admin_status and current_admins <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "must keep one active admin")

    db.add(AuditLog(actor_id=actor.id, action="user.update", target_kind="user", target_id=str(user.id), metadata_json={"email": user.email, "role": user.role, "is_active": user.is_active}))
    await db.commit()
    await db.refresh(user)
    return UserAdminOut.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_admin())],
) -> None:
    user = await _load_user_or_404(db, user_id)
    if user.id == actor.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot delete own account")
    if user.role == "admin" and user.is_active and await _active_admin_count(db) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "must keep one active admin")
    await db.delete(user)
    db.add(AuditLog(actor_id=actor.id, action="user.delete", target_kind="user", target_id=str(user.id), metadata_json={"email": user.email}))
    await db.commit()
