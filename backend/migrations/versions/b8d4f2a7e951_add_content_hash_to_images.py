"""add content hash to images

Revision ID: b8d4f2a7e951
Revises: c07a0e3c5e96
Create Date: 2026-10-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d4f2a7e951'
down_revision: Union[str, Sequence[str], None] = 'c07a0e3c5e96'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # SHA-256 of uploaded bytes, used by /flights/upload-batch to skip
    # re-uploads of already-stored frames. Nullable: rows created before this
    # migration have no stored hash, and NULL never equals NULL in the
    # dedup lookup, so legacy frames are never skipped.
    op.add_column('images', sa.Column('content_hash', sa.String(), nullable=True))
    op.create_index('ix_images_content_hash', 'images', ['content_hash'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_images_content_hash', table_name='images')
    op.drop_column('images', 'content_hash')
