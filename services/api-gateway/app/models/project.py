from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, JSON, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    project_type: Mapped[str] = mapped_column(String(64), default="web")
    stack: Mapped[str] = mapped_column(String(255), default="")
    brief: Mapped[str] = mapped_column(String(4096), default="")
    features: Mapped[list[str]] = mapped_column(JSON, default=list)
    constraints: Mapped[list[str]] = mapped_column(JSON, default=list)
    repo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    workspace_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    node_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("nodes.id"), nullable=True)
    build_command: Mapped[str | None] = mapped_column(String(512), nullable=True)
    test_command: Mapped[str | None] = mapped_column(String(512), nullable=True)
    run_command: Mapped[str | None] = mapped_column(String(512), nullable=True)
    deploy_command: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    last_task_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
