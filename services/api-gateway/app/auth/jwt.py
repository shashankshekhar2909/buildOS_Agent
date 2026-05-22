from datetime import datetime, timedelta, timezone
from typing import Literal
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_settings = get_settings()


def hash_password(pw: str) -> str:
    return _pwd.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    return _pwd.verify(pw, hashed)


def _encode(sub: str, ttl: timedelta, kind: Literal["access", "refresh"], extra: dict | None = None) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {"sub": sub, "iat": now, "exp": now + ttl, "kind": kind, **(extra or {})}
    return jwt.encode(payload, _settings.jwt_secret, algorithm=_settings.jwt_alg)


def make_access_token(sub: str, role: str) -> str:
    return _encode(sub, timedelta(minutes=_settings.jwt_access_ttl_min), "access", {"role": role})


def make_refresh_token(sub: str) -> str:
    return _encode(sub, timedelta(days=_settings.jwt_refresh_ttl_days), "refresh")


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _settings.jwt_secret, algorithms=[_settings.jwt_alg])
    except JWTError as e:
        raise ValueError(f"invalid token: {e}") from e
