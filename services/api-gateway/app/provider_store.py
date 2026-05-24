from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt, encrypt
from app.models import Secret


def provider_secret_scope(provider: str, owner_id: UUID | None = None) -> str:
    if owner_id is None:
        return f"provider:{provider}"
    return f"user:{owner_id}:provider:{provider}"


async def get_provider_secret(
    db: AsyncSession,
    provider: str,
    name: str = "api_key",
    owner_id: UUID | None = None,
) -> str | None:
    row = (
        await db.execute(
            select(Secret).where(Secret.scope == provider_secret_scope(provider, owner_id), Secret.name == name)
        )
    ).scalar_one_or_none()
    if not row:
        return None
    try:
        return decrypt(row.ciphertext)
    except Exception:
        return None


async def upsert_provider_secret(
    db: AsyncSession,
    provider: str,
    value: str,
    name: str = "api_key",
    owner_id: UUID | None = None,
) -> Secret:
    row = (
        await db.execute(
            select(Secret).where(Secret.scope == provider_secret_scope(provider, owner_id), Secret.name == name)
        )
    ).scalar_one_or_none()
    if row:
        row.ciphertext = encrypt(value)
        secret = row
    else:
        secret = Secret(scope=provider_secret_scope(provider, owner_id), name=name, ciphertext=encrypt(value), owner_id=owner_id)
        db.add(secret)
    await db.flush()
    return secret


async def delete_provider_secret(
    db: AsyncSession,
    provider: str,
    name: str = "api_key",
    owner_id: UUID | None = None,
) -> None:
    await db.execute(delete(Secret).where(Secret.scope == provider_secret_scope(provider, owner_id), Secret.name == name))


async def provider_configured(
    db: AsyncSession,
    provider: str,
    env_value: str | None = None,
    owner_id: UUID | None = None,
) -> tuple[bool, str]:
    if provider == "ollama":
        return True, "local"
    if owner_id is not None:
        db_value = await get_provider_secret(db, provider, owner_id=owner_id)
        if db_value:
            return True, "user-db"
    db_value = await get_provider_secret(db, provider)
    if db_value:
        return True, "db"
    if env_value:
        return True, "env"
    return False, "none"
