"""projects table

Revision ID: 3f2b8a6d1c90
Revises: 2a3c4d5e6f70
Create Date: 2026-05-30 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "3f2b8a6d1c90"
down_revision: Union[str, Sequence[str], None] = "2a3c4d5e6f70"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("project_type", sa.String(length=64), nullable=False, server_default="web"),
        sa.Column("stack", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("brief", sa.String(length=4096), nullable=False, server_default=""),
        sa.Column("features", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("constraints", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("repo_url", sa.String(length=512), nullable=True),
        sa.Column("workspace_path", sa.String(length=512), nullable=True),
        sa.Column("node_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("nodes.id"), nullable=True),
        sa.Column("build_command", sa.String(length=512), nullable=True),
        sa.Column("test_command", sa.String(length=512), nullable=True),
        sa.Column("run_command", sa.String(length=512), nullable=True),
        sa.Column("deploy_command", sa.String(length=512), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("last_task_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id"), nullable=True),
        sa.Column("created_by", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("name", name="uq_projects_name"),
    )
    op.create_index("ix_projects_name", "projects", ["name"])
    op.create_index("ix_projects_status", "projects", ["status"])
    op.create_index("ix_projects_node_id", "projects", ["node_id"])


def downgrade() -> None:
    op.drop_index("ix_projects_node_id", table_name="projects")
    op.drop_index("ix_projects_status", table_name="projects")
    op.drop_index("ix_projects_name", table_name="projects")
    op.drop_table("projects")
