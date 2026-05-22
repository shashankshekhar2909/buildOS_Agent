from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt, encrypt
from app.models import Secret


def user_secret_scope(user_id: UUID) -> str:
    return f"user:{user_id}"


async def get_user_secret(db: AsyncSession, user_id: UUID, name: str) -> dict[str, Any] | None:
    row = (
        await db.execute(select(Secret).where(Secret.scope == user_secret_scope(user_id), Secret.name == name))
    ).scalar_one_or_none()
    if not row:
        return None
    try:
        return json.loads(decrypt(row.ciphertext))
    except Exception:
        return None


async def upsert_user_secret(db: AsyncSession, user_id: UUID, name: str, value: dict[str, Any]) -> Secret:
    payload = json.dumps(value)
    row = (
        await db.execute(select(Secret).where(Secret.scope == user_secret_scope(user_id), Secret.name == name))
    ).scalar_one_or_none()
    if row:
        row.ciphertext = encrypt(payload)
        secret = row
    else:
        secret = Secret(scope=user_secret_scope(user_id), name=name, ciphertext=encrypt(payload), owner_id=user_id)
        db.add(secret)
    await db.flush()
    return secret


async def delete_user_secret(db: AsyncSession, user_id: UUID, name: str) -> None:
    await db.execute(
        delete(Secret).where(Secret.scope == user_secret_scope(user_id), Secret.name == name)
    )
