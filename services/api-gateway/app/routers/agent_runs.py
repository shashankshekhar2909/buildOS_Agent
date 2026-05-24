from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import datetime, timezone

from app.auth.deps import current_user, require_role
from app.db import get_db
from app.events import publish
from app.models import AgentRun, AgentRunState, Approval, ApprovalState, AuditLog, User

router = APIRouter(prefix="/v1/agent-runs", tags=["agent-runs"])


class AgentRunOut(BaseModel):
    id: str
    agent_name: str
    user_id: str | None
    model: str
    initial_message: str
    state: str
    stop_reason: str | None
    output: str | None
    error: str | None
    pending_tool: dict | None
    skills: list[str]
    steps: list[dict]
    messages: list[dict]
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: AgentRun) -> "AgentRunOut":
        return cls(
            id=str(row.id),
            agent_name=row.agent_name,
            user_id=str(row.user_id) if row.user_id else None,
            model=row.model,
            initial_message=row.initial_message,
            state=row.state.value,
            stop_reason=row.stop_reason,
            output=row.output,
            error=row.error,
            pending_tool=row.pending_tool,
            skills=list(row.skills or []),
            steps=list(row.steps or []),
            messages=list(row.messages or []),
            created_at=row.created_at.isoformat() if row.created_at else "",
            updated_at=row.updated_at.isoformat() if row.updated_at else "",
        )


@router.get("", response_model=list[AgentRunOut])
async def list_runs(
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> list[AgentRunOut]:
    rows = (await db.execute(select(AgentRun).order_by(AgentRun.created_at.desc()).limit(100))).scalars().all()
    return [AgentRunOut.from_row(r) for r in rows]


@router.get("/{run_id}", response_model=AgentRunOut)
async def get_run(
    run_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    _user: Annotated[User, Depends(current_user)],
) -> AgentRunOut:
    row = (await db.execute(select(AgentRun).where(AgentRun.id == run_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "agent run not found")
    return AgentRunOut.from_row(row)
