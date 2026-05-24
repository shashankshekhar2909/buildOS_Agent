"""node ssh fields

Revision ID: b7c0e2f1d4a9
Revises: 3a8c4cb0f0c1
Create Date: 2026-05-23 06:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c0e2f1d4a9"
down_revision: Union[str, None] = "3a8c4cb0f0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("ssh_host", sa.String(length=255), nullable=True))
    op.add_column("nodes", sa.Column("ssh_user", sa.String(length=128), nullable=True))
    op.add_column("nodes", sa.Column("ssh_port", sa.Integer(), nullable=True))
    op.add_column("nodes", sa.Column("ssh_auth_type", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("nodes", "ssh_auth_type")
    op.drop_column("nodes", "ssh_port")
    op.drop_column("nodes", "ssh_user")
    op.drop_column("nodes", "ssh_host")
