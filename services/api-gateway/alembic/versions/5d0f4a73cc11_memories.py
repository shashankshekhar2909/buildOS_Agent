"""memories table (pgvector)

Revision ID: 5d0f4a73cc11
Revises: 4c91b21d8e10
Create Date: 2026-05-23 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5d0f4a73cc11"
down_revision: Union[str, None] = "4c91b21d8e10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute(
        """
        CREATE TABLE memories (
            id UUID PRIMARY KEY,
            user_id UUID REFERENCES users(id),
            kind VARCHAR(32) NOT NULL DEFAULT 'note',
            text VARCHAR(8192) NOT NULL,
            embedding vector(1536),
            source VARCHAR(32) NOT NULL DEFAULT 'manual',
            source_id VARCHAR(128),
            meta JSON NOT NULL DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.create_index("ix_memories_user_id", "memories", ["user_id"])
    op.create_index("ix_memories_kind", "memories", ["kind"])
    op.execute(
        "CREATE INDEX ix_memories_embedding ON memories "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_memories_embedding")
    op.drop_index("ix_memories_kind", table_name="memories")
    op.drop_index("ix_memories_user_id", table_name="memories")
    op.drop_table("memories")
