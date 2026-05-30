"""task agent run link

Revision ID: 7d2c5b1a9f60
Revises: 9c2f7c1a8b44
Create Date: 2026-05-30 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7d2c5b1a9f60"
down_revision = "9c2f7c1a8b44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("agent_run_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_agent_run_id_agent_runs",
        "tasks",
        "agent_runs",
        ["agent_run_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_tasks_agent_run_id_agent_runs", "tasks", type_="foreignkey")
    op.drop_column("tasks", "agent_run_id")
