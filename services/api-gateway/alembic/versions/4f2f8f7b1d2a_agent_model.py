"""agent model column

Revision ID: 4f2f8f7b1d2a
Revises: b7c0e2f1d4a9
Create Date: 2026-05-24 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4f2f8f7b1d2a"
down_revision: Union[str, None] = "b7c0e2f1d4a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("model", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("agents", "model")
