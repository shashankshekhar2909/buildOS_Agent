from typing import Annotated
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import decode_token
from app.config import get_settings
from app.db import get_db
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/login", auto_error=False)


async def current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing token")
    try:
        payload = decode_token(token)
    except ValueError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e)) from e
    if payload.get("kind") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "wrong token kind")
    user = (await db.execute(select(User).where(User.email == payload["sub"]))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user inactive")
    return user


def require_role(*roles: str):
    async def _dep(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return user
    return _dep


def require_admin():
    return require_role("admin")


def require_internal_token(x_internal_token: Annotated[str | None, Header()] = None) -> None:
    s = get_settings()
    if not x_internal_token or x_internal_token != s.internal_service_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad internal token")


def require_node_token(x_node_token: Annotated[str | None, Header()] = None) -> None:
    s = get_settings()
    if not x_node_token or x_node_token != s.node_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad node token")
