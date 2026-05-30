from __future__ import annotations

from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import current_user
from app.chat_store import record_chat_message
from app.connector_store import get_user_secret
from app.db import get_db
from app.models import User, WhatsAppMessage
from app.schemas import WhatsAppMessageOut, WhatsAppSendIn, WhatsAppThreadOut
from app.whatsapp_bridge import record_whatsapp_message, send_whatsapp_message

router = APIRouter(prefix="/v1/whatsapp", tags=["whatsapp"])


@router.get("/threads", response_model=list[WhatsAppThreadOut])
async def list_threads(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> list[WhatsAppThreadOut]:
    rows = (
        await db.execute(
            select(WhatsAppMessage)
            .where(WhatsAppMessage.owner_id == user.id)
            .order_by(WhatsAppMessage.created_at.desc())
        )
    ).scalars().all()
    latest: dict[str, WhatsAppMessage] = {}
    counts: dict[str, int] = defaultdict(int)
    for row in rows:
      counts[row.remote_id] += 1
      latest.setdefault(row.remote_id, row)
    threads = [
        WhatsAppThreadOut(
            remote_id=remote_id,
            phone_number_id=row.phone_number_id,
            last_message=row.text,
            last_message_at=row.created_at,
            message_count=counts[remote_id],
            unread_count=0,
        )
        for remote_id, row in latest.items()
    ]
    threads.sort(key=lambda item: item.last_message_at, reverse=True)
    return threads


@router.get("/threads/{remote_id}", response_model=list[WhatsAppMessageOut])
async def get_thread(
    remote_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> list[WhatsAppMessageOut]:
    rows = (
        await db.execute(
            select(WhatsAppMessage)
            .where(WhatsAppMessage.owner_id == user.id, WhatsAppMessage.remote_id == remote_id)
            .order_by(WhatsAppMessage.created_at.asc())
        )
    ).scalars().all()
    return [WhatsAppMessageOut.model_validate(row) for row in rows]


@router.post("/threads/{remote_id}/messages", response_model=WhatsAppMessageOut, status_code=status.HTTP_201_CREATED)
async def send_thread_message(
    remote_id: str,
    body: WhatsAppSendIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> WhatsAppMessageOut:
    secret = await get_user_secret(db, user.id, "whatsapp")
    if not secret:
        raise HTTPException(status.HTTP_409_CONFLICT, "whatsapp connector not registered")
    access_token = str(secret.get("access_token") or "").strip()
    phone_number_id = str(secret.get("phone_number_id") or "").strip()
    version = str(secret.get("version") or "v20.0").strip()
    if not access_token or not phone_number_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "whatsapp connector incomplete")
    result = await send_whatsapp_message(access_token, version, phone_number_id, remote_id, body.message)
    if not result.get("ok"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(result.get("error") or "whatsapp send failed"))
    message_id = None
    try:
        message_id = str((result.get("raw") or {}).get("messages", [{}])[0].get("id") or "")
    except Exception:
        message_id = None
    row = await record_whatsapp_message(
        db,
        owner_id=user.id,
        phone_number_id=phone_number_id,
        remote_id=remote_id,
        direction="outgoing",
        text=body.message,
        message_id=message_id or None,
    )
    await record_chat_message(
        db,
        owner_id=user.id,
        role="user",
        content=body.message,
        agent_name=str(secret.get("default_agent") or "core"),
        model=str(secret.get("default_model") or ""),
        source="whatsapp",
    )
    await db.commit()
    await db.refresh(row)
    return WhatsAppMessageOut.model_validate(row)
