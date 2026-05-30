from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage


async def record_chat_message(
    db: AsyncSession,
    *,
    owner_id: UUID,
    role: str,
    content: str,
    agent_name: str = "core",
    model: str = "",
    source: str = "app",
    run_id: UUID | None = None,
) -> ChatMessage:
    row = ChatMessage(
        owner_id=owner_id,
        role=role,
        content=content,
        agent_name=agent_name,
        model=model,
        source=source,
        run_id=run_id,
    )
    db.add(row)
    await db.flush()
    return row
