"""agent_runs table + approvals agent_run_id

Revision ID: 4c91b21d8e10
Revises: 3a8c4cb0f0c1
Create Date: 2026-05-23 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "4c91b21d8e10"
down_revision: Union[str, None] = "3a8c4cb0f0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    state_enum = postgresql.ENUM(
        "running", "completed", "failed", "waiting_approval", "cancelled",
        name="agentrunstate",
        create_type=False,
    )
    op.execute(
        "DO $$ BEGIN "
        "CREATE TYPE agentrunstate AS ENUM ('running','completed','failed','waiting_approval','cancelled'); "
        "EXCEPTION WHEN duplicate_object THEN null; END $$;"
    )
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("agent_name", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("initial_message", sa.String(length=8192), nullable=False),
        sa.Column("state", state_enum, nullable=False, server_default="running"),
        sa.Column("stop_reason", sa.String(length=128), nullable=True),
        sa.Column("messages", sa.JSON(), nullable=False),
        sa.Column("steps", sa.JSON(), nullable=False),
        sa.Column("pending_tool", sa.JSON(), nullable=True),
        sa.Column("skills", sa.JSON(), nullable=False),
        sa.Column("max_steps", sa.Integer(), nullable=False, server_default="6"),
        sa.Column("output", sa.String(length=16384), nullable=True),
        sa.Column("error", sa.String(length=2048), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_agent_runs_agent_name"), "agent_runs", ["agent_name"])

    op.add_column("approvals", sa.Column("agent_run_id", sa.UUID(), sa.ForeignKey("agent_runs.id"), nullable=True))
    op.add_column("approvals", sa.Column("tool_call_id", sa.String(length=128), nullable=True))
    op.add_column("approvals", sa.Column("tool", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("approvals", "tool")
    op.drop_column("approvals", "tool_call_id")
    op.drop_column("approvals", "agent_run_id")
    op.drop_index(op.f("ix_agent_runs_agent_name"), table_name="agent_runs")
    op.drop_table("agent_runs")
    op.execute("DROP TYPE IF EXISTS agentrunstate")
