"""add image dimensions to images

Revision ID: c07a0e3c5e96
Revises: ed74cafd83cd
Create Date: 2026-09-28 16:23:36.282401

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c07a0e3c5e96'
down_revision: Union[str, Sequence[str], None] = 'ed74cafd83cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable: existing rows (and duplicates_skipped frames) have unknown
    # dimensions until re-processed; the app falls back to decoding when null.
    op.add_column('images', sa.Column('image_width', sa.Integer(), nullable=True))
    op.add_column('images', sa.Column('image_height', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('images', 'image_height')
    op.drop_column('images', 'image_width')
