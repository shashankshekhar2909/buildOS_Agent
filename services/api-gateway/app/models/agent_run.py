from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, JSON, String, ForeignKey, Enum as SAEnum, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AgentRunState(str, enum.Enum):
    running = "running"
    completed = "completed"
    failed = "failed"
    waiting_approval = "waiting_approval"
    cancelled = "cancelled"


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    agent_name: Mapped[str] = mapped_column(String(128), index=True)
    user_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    model: Mapped[str] = mapped_column(String(128), default="claude-sonnet")
    initial_message: Mapped[str] = mapped_column(String(8192))
    state: Mapped[AgentRunState] = mapped_column(SAEnum(AgentRunState), default=AgentRunState.running)
    stop_reason: Mapped[str | None] = mapped_column(String(128), nullable=True)
    messages: Mapped[list] = mapped_column(JSON, default=list)  # full OpenAI message array
    steps: Mapped[list] = mapped_column(JSON, default=list)  # list of {tool, arguments, result, error}
    pending_tool: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    skills: Mapped[list[str]] = mapped_column(JSON, default=list)
    max_steps: Mapped[int] = mapped_column(default=6)
    output: Mapped[str | None] = mapped_column(String(16384), nullable=True)
    error: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
