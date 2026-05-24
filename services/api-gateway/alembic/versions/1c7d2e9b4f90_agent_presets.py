"""agent presets table

Revision ID: 1c7d2e9b4f90
Revises: 9c2f7c1a8b44
Create Date: 2026-05-24 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "1c7d2e9b4f90"
down_revision: Union[str, Sequence[str], None] = "9c2f7c1a8b44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_presets",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("agent_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("system_prompt", sa.String(length=4096), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("skills", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("agent_id", "label", name="uq_agent_presets_agent_label"),
    )
    op.create_index("ix_agent_presets_agent_id", "agent_presets", ["agent_id"])
    op.create_index("ix_agent_presets_label", "agent_presets", ["label"])


def downgrade() -> None:
    op.drop_index("ix_agent_presets_label", table_name="agent_presets")
    op.drop_index("ix_agent_presets_agent_id", table_name="agent_presets")
    op.drop_table("agent_presets")
