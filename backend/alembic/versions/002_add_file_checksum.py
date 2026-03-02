"""add file checksum column

Revision ID: 002
Revises: 001
Create Date: 2026-03-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SHA-256 hex digest (64 chars), nullable so existing rows are unaffected
    op.add_column(
        "files",
        sa.Column("checksum", sa.String(64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("files", "checksum")
