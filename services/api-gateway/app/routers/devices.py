from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user
from app.db import get_db
from app.models import AuditLog, Device, User

router = APIRouter(prefix="/v1/devices", tags=["devices"])


class DeviceIn(BaseModel):
    push_token: str = Field(min_length=1, max_length=256)
    platform: str = "unknown"
    app_version: str | None = None


class DeviceOut(BaseModel):
    id: str
    push_token: str
    platform: str
    app_version: str | None
    created_at: str
    last_seen: str


def _out(d: Device) -> DeviceOut:
    return DeviceOut(
        id=str(d.id),
        push_token=d.push_token,
        platform=d.platform,
        app_version=d.app_version,
        created_at=d.created_at.isoformat() if d.created_at else "",
        last_seen=d.last_seen.isoformat() if d.last_seen else "",
    )


@router.get("", response_model=list[DeviceOut])
async def list_(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> list[DeviceOut]:
    rows = (await db.execute(select(Device).where(Device.user_id == user.id))).scalars().all()
    return [_out(d) for d in rows]


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
async def register(
    body: DeviceIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> DeviceOut:
    existing = (await db.execute(select(Device).where(Device.push_token == body.push_token))).scalar_one_or_none()
    if existing:
        existing.user_id = user.id
        existing.platform = body.platform
        existing.app_version = body.app_version
        existing.last_seen = datetime.now(tz=timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return _out(existing)

    d = Device(
        user_id=user.id,
        push_token=body.push_token,
        platform=body.platform,
        app_version=body.app_version,
    )
    db.add(d)
    db.add(AuditLog(actor_id=user.id, action="device.register", target_kind="device", target_id=body.push_token[:32]))
    await db.commit()
    await db.refresh(d)
    return _out(d)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unregister(
    device_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> None:
    d = (await db.execute(select(Device).where(Device.id == device_id, Device.user_id == user.id))).scalar_one_or_none()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
    await db.delete(d)
    db.add(AuditLog(actor_id=user.id, action="device.unregister", target_kind="device", target_id=str(d.id)))
    await db.commit()
