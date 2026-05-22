from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import String, DateTime, JSON, Boolean, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    version: Mapped[str] = mapped_column(String(32), default="0.1.0")
    description: Mapped[str] = mapped_column(String(512), default="")
    manifest: Mapped[dict] = mapped_column(JSON, default=dict)
    permissions: Mapped[list[str]] = mapped_column(JSON, default=list)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
