from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user
from app.auth.jwt import (
    decode_token,
    hash_password,
    make_access_token,
    make_refresh_token,
    verify_password,
)
from app.auth import refresh_store
from app.config import get_settings
from app.db import get_db
from app.models import AuditLog, User
from app.schemas import LoginIn, RegisterIn, TokenPair, UserOut

router = APIRouter(prefix="/v1/auth", tags=["auth"])

_settings = get_settings()
_REFRESH_TTL_SEC = _settings.jwt_refresh_ttl_days * 24 * 3600


async def _issue_pair(user: User, family: str | None = None) -> TokenPair:
    access = make_access_token(user.email, user.role)
    refresh, jti, fam = make_refresh_token(user.email, family)
    await refresh_store.register(user.email, jti, fam, _REFRESH_TTL_SEC)
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenPair:
    email = body.email.strip().lower()
    total = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    if total > 0:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "registration is admin-managed")
    exists = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    user = User(email=email, password_hash=hash_password(body.password), role="admin")
    db.add(user)
    await db.commit()
    return await _issue_pair(user)


@router.post("/login", response_model=TokenPair)
async def login(body: LoginIn, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenPair:
    email = body.email.strip().lower()
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad credentials")
    return await _issue_pair(user)


class RefreshIn(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshIn, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenPair:
    try:
        payload = decode_token(body.refresh_token)
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    if payload.get("kind") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong token kind")

    jti = payload.get("jti")
    family = payload.get("family")
    if not jti or not family:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "malformed refresh")

    marker = await refresh_store.consume(jti)
    if marker is None:
        # Token reuse — treat as compromise. Revoke entire family.
        revoked = await refresh_store.revoke_family(family)
        db.add(AuditLog(action="auth.refresh_reuse", target_kind="family", target_id=family, metadata_json={"revoked": revoked}))
        await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "refresh reuse detected — family revoked")

    user = (await db.execute(select(User).where(User.email == payload["sub"]))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user inactive")

    return await _issue_pair(user, family=family)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshIn) -> None:
    try:
        payload = decode_token(body.refresh_token)
    except ValueError:
        return
    family = payload.get("family")
    if family:
        await refresh_store.revoke_family(family)


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(current_user)]) -> UserOut:
    return UserOut.model_validate(user)
