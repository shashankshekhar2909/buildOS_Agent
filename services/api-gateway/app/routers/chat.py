from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent_runtime import drive_loop, resolve_skills
from app.chat_store import record_chat_message
from app.auth.deps import current_user
from app.db import get_db
from app.llm_store import default_chat_model
from app.models import Agent, ChatMessage, User
from app.schemas import ChatMessageOut, ChatSendIn, ChatSendOut

router = APIRouter(prefix="/v1/chat", tags=["chat"])


async def _get_agent(db: AsyncSession, name: str) -> Agent | None:
    return (await db.execute(select(Agent).where(Agent.name == name))).scalar_one_or_none()


def _message_out(row: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut(
        id=row.id,
        owner_id=row.owner_id,
        role=row.role,
        content=row.content,
        agent_name=row.agent_name,
        model=row.model,
        source=row.source,
        run_id=row.run_id,
        created_at=row.created_at,
    )


@router.get("/messages", response_model=list[ChatMessageOut])
async def list_messages(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
    agent_name: str = "core",
    source: str = "app",
) -> list[ChatMessageOut]:
    rows = (
        await db.execute(
            select(ChatMessage)
            .where(
                ChatMessage.owner_id == user.id,
                ChatMessage.agent_name == agent_name,
                ChatMessage.source == source,
            )
            .order_by(ChatMessage.created_at.asc())
        )
    ).scalars().all()
    return [_message_out(row) for row in rows]


@router.delete("/messages", status_code=status.HTTP_204_NO_CONTENT)
async def clear_messages(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
    agent_name: str = "core",
    source: str = "app",
) -> None:
    await db.execute(
        delete(ChatMessage).where(
            ChatMessage.owner_id == user.id,
            ChatMessage.agent_name == agent_name,
            ChatMessage.source == source,
        )
    )
    await db.commit()


@router.post("/messages", response_model=ChatSendOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    body: ChatSendIn,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
) -> ChatSendOut:
    agent = await _get_agent(db, body.agent_name)
    system_prompt = agent.system_prompt if agent else None
    skill_names = list(agent.skills or []) if agent else None
    model = body.model or (agent.model if agent and agent.model else None) or default_chat_model()
    prompt, allowed = resolve_skills(body.agent_name, skill_overrides=body.skill_overrides, system_prompt=system_prompt, skill_names=skill_names)

    history_rows = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.owner_id == user.id, ChatMessage.agent_name == body.agent_name)
            .order_by(ChatMessage.created_at.asc())
        )
    ).scalars().all()
    messages: list[dict] = [{"role": "system", "content": prompt}] if prompt else []
    messages.extend({"role": row.role, "content": row.content} for row in history_rows)
    messages.append({"role": "user", "content": body.message})

    user_row = ChatMessage(
        owner_id=user.id,
        role="user",
        content=body.message,
        agent_name=body.agent_name,
        model=model,
        source="app",
    )
    db.add(user_row)
    await db.flush()

    try:
        result = await drive_loop(messages, allowed, model=model, max_steps=body.max_steps)
        assistant_text = (result.output or "").strip()
        if not assistant_text and result.stop_reason == "approval_required":
            assistant_text = "Approval required."
        if not assistant_text:
            assistant_text = "No output."
        assistant_row = ChatMessage(
            owner_id=user.id,
            role="assistant",
            content=assistant_text,
            agent_name=body.agent_name,
            model=model,
            source="app",
        )
        db.add(assistant_row)
        await db.commit()
        await db.refresh(user_row)
        await db.refresh(assistant_row)
        return ChatSendOut(
            state=result.stop_reason or "completed",
            output=result.output,
            pending_tool=result.pending_tool,
            steps=[
                {"tool": step.tool, "arguments": step.arguments, "result": step.result, "error": step.error}
                for step in result.steps
            ],
            user_message=_message_out(user_row),
            assistant_message=_message_out(assistant_row),
        )
    except Exception as exc:
        assistant_row = ChatMessage(
            owner_id=user.id,
            role="assistant",
            content=f"Error: {exc}",
            agent_name=body.agent_name,
            model=model,
            source="app",
        )
        db.add(assistant_row)
        await db.commit()
        await db.refresh(user_row)
        await db.refresh(assistant_row)
        return ChatSendOut(
            state="failed",
            output=None,
            pending_tool=None,
            steps=[],
            user_message=_message_out(user_row),
            assistant_message=_message_out(assistant_row),
        )
