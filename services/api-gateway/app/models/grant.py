from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SkillGrant(Base):
    """Per-user permission to invoke a specific skill (by name)."""
    __tablename__ = "skill_grants"
    __table_args__ = (UniqueConstraint("user_id", "skill_name", name="uq_user_skill"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    skill_name: Mapped[str] = mapped_column(String(128), index=True)
    granted_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
