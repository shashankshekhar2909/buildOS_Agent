import enum
from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import String, DateTime, JSON, ForeignKey, Enum as SAEnum, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ApprovalState(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    denied = "denied"
    expired = "expired"


class Approval(Base):
    __tablename__ = "approvals"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    task_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(128))
    risk: Mapped[str] = mapped_column(String(16), default="medium")  # low|medium|high|critical
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    state: Mapped[ApprovalState] = mapped_column(SAEnum(ApprovalState), default=ApprovalState.pending)
    decided_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
