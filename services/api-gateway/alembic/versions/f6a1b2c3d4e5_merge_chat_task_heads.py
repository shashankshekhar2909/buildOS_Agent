"""merge chat and task heads

Revision ID: f6a1b2c3d4e5
Revises: 7d2c5b1a9f60, c1e2d3f4a5b6
Create Date: 2026-05-30 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "f6a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = ("7d2c5b1a9f60", "c1e2d3f4a5b6")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
