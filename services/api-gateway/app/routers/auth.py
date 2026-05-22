from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user
from app.auth.jwt import (
    decode_token,
    hash_password,
    make_access_token,
    make_refresh_token,
    verify_password,
)
from app.db import get_db
from app.models import User
from app.schemas import LoginIn, RegisterIn, TokenPair, UserOut

router = APIRouter(prefix="/v1/auth", tags=["auth"])


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenPair:
    exists = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    role = "admin" if (await db.execute(select(User))).first() is None else "viewer"
    user = User(email=body.email, password_hash=hash_password(body.password), role=role)
    db.add(user)
    await db.commit()
    return TokenPair(
        access_token=make_access_token(user.email, user.role),
        refresh_token=make_refresh_token(user.email),
    )


@router.post("/login", response_model=TokenPair)
async def login(body: LoginIn, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenPair:
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad credentials")
    return TokenPair(
        access_token=make_access_token(user.email, user.role),
        refresh_token=make_refresh_token(user.email),
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh(refresh_token: str, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenPair:
    try:
        payload = decode_token(refresh_token)
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    if payload.get("kind") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong token kind")
    user = (await db.execute(select(User).where(User.email == payload["sub"]))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user inactive")
    return TokenPair(
        access_token=make_access_token(user.email, user.role),
        refresh_token=make_refresh_token(user.email),
    )


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(current_user)]) -> UserOut:
    return UserOut.model_validate(user)
