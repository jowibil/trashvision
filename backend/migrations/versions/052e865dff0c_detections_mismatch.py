"""Detections mismatch

Revision ID: 052e865dff0c
Revises: 782ef2c96f10
Create Date: 2026-08-10 00:04:55.238030

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '052e865dff0c'
down_revision: Union[str, Sequence[str], None] = '782ef2c96f10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely."""
    # Prevent dropping PostGIS system table
    pass


def downgrade() -> None:
    """Downgrade schema safely."""
    pass