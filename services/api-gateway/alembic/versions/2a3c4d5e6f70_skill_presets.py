"""skill presets table

Revision ID: 2a3c4d5e6f70
Revises: 1c7d2e9b4f90
Create Date: 2026-05-24 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "2a3c4d5e6f70"
down_revision: Union[str, Sequence[str], None] = "1c7d2e9b4f90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "skill_presets",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("skill_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("skills.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("version", sa.String(length=32), nullable=False, server_default="0.1.0"),
        sa.Column("description", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("permissions", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("manifest", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("skill_id", "label", name="uq_skill_presets_skill_label"),
    )
    op.create_index("ix_skill_presets_skill_id", "skill_presets", ["skill_id"])
    op.create_index("ix_skill_presets_label", "skill_presets", ["label"])


def downgrade() -> None:
    op.drop_index("ix_skill_presets_label", table_name="skill_presets")
    op.drop_index("ix_skill_presets_skill_id", table_name="skill_presets")
    op.drop_table("skill_presets")
