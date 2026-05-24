"""merge agent migration branches

Revision ID: 9c2f7c1a8b44
Revises: 6e1b8c40a921, 4f2f8f7b1d2a
Create Date: 2026-05-24 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "9c2f7c1a8b44"
down_revision: Union[str, Sequence[str], None] = ("6e1b8c40a921", "4f2f8f7b1d2a")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
