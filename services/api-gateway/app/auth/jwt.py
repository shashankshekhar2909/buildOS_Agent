import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt
from jose import JWTError, jwt

from app.config import get_settings

_settings = get_settings()
# bcrypt limits inputs to 72 bytes — truncate at the boundary so callers never crash on long passwords.
_MAX_PW_BYTES = 72


def _clip(pw: str) -> bytes:
    return pw.encode("utf-8")[:_MAX_PW_BYTES]


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(_clip(pw), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_clip(pw), hashed.encode())
    except ValueError:
        return False


def _encode(sub: str, ttl: timedelta, kind: Literal["access", "refresh"], extra: dict | None = None) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {"sub": sub, "iat": now, "exp": now + ttl, "kind": kind, **(extra or {})}
    return jwt.encode(payload, _settings.jwt_secret, algorithm=_settings.jwt_alg)


def make_access_token(sub: str, role: str) -> str:
    return _encode(sub, timedelta(minutes=_settings.jwt_access_ttl_min), "access", {"role": role})


def make_refresh_token(sub: str, family: str | None = None) -> tuple[str, str, str]:
    """Returns (token, jti, family). family ties rotation; jti is single-use."""
    jti = secrets.token_urlsafe(16)
    fam = family or secrets.token_urlsafe(16)
    token = _encode(
        sub,
        timedelta(days=_settings.jwt_refresh_ttl_days),
        "refresh",
        {"jti": jti, "family": fam},
    )
    return token, jti, fam


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _settings.jwt_secret, algorithms=[_settings.jwt_alg])
    except JWTError as e:
        raise ValueError(f"invalid token: {e}") from e
