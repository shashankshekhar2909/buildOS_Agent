"""chat source column

Revision ID: 0a1b2c3d4e5f
Revises: f6a1b2c3d4e5
Create Date: 2026-05-31 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0a1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "f6a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("source", sa.String(length=32), nullable=False, server_default=sa.text("'app'")))
    op.create_index("ix_chat_messages_source", "chat_messages", ["source"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_source", table_name="chat_messages")
    op.drop_column("chat_messages", "source")
