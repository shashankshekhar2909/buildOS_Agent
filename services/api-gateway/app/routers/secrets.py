from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user, require_role
from app.crypto import encrypt
from app.db import get_db
from app.models import AuditLog, Secret, User

router = APIRouter(prefix="/v1/secrets", tags=["secrets"])


class SecretIn(BaseModel):
    scope: str
    name: str
    value: str


class SecretOut(BaseModel):
    id: str
    scope: str
    name: str
    created_at: str
    updated_at: str


@router.get("", response_model=list[SecretOut])
async def list_secrets(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(require_role("admin", "operator"))],
) -> list[SecretOut]:
    """Returns metadata only — never the decrypted value."""
    rows = (await db.execute(select(Secret).order_by(Secret.scope, Secret.name))).scalars().all()
    return [
        SecretOut(
            id=str(r.id), scope=r.scope, name=r.name,
            created_at=r.created_at.isoformat(), updated_at=r.updated_at.isoformat(),
        )
        for r in rows
    ]


@router.post("", response_model=SecretOut, status_code=status.HTTP_201_CREATED)
async def upsert_secret(
    body: SecretIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> SecretOut:
    existing = (
        await db.execute(select(Secret).where(Secret.scope == body.scope, Secret.name == body.name))
    ).scalar_one_or_none()
    if existing:
        existing.ciphertext = encrypt(body.value)
        s = existing
    else:
        s = Secret(scope=body.scope, name=body.name, ciphertext=encrypt(body.value), owner_id=user.id)
        db.add(s)
    db.add(AuditLog(actor_id=user.id, action="secret.upsert", target_kind="secret", target_id=f"{body.scope}/{body.name}"))
    await db.commit()
    await db.refresh(s)
    return SecretOut(
        id=str(s.id), scope=s.scope, name=s.name,
        created_at=s.created_at.isoformat(), updated_at=s.updated_at.isoformat(),
    )


@router.delete("/{secret_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_secret(
    secret_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
) -> None:
    s = (await db.execute(select(Secret).where(Secret.id == secret_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "secret not found")
    await db.delete(s)
    db.add(AuditLog(actor_id=user.id, action="secret.delete", target_kind="secret", target_id=secret_id))
    await db.commit()
