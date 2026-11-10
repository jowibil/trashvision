"""add images.created_at, upload_batch, processing_error

Upload plan v1, step 1 (one migration, three columns):

- created_at: the insert/activity clock. `captured_at` stays the EXIF shutter
  time and keeps deciding flight dates and map windows; this column only
  answers "when did the row arrive / is a worker alive?".
- upload_batch: the id of the single POST that produced the row, so "which
  request did these 40 rows come from" is answerable without append support.
- processing_error: the reason a row ended in `failed`, which the worker
  previously discarded.

All three are nullable with no backfill: rows written before this revision
have unknown activity time and no batch id, which is honest.

Revision ID: c3f7a91b2d64
Revises: a8c3d1e4f7b2
Create Date: 2026-11-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c3f7a91b2d64"
down_revision: Union[str, Sequence[str], None] = "a8c3d1e4f7b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "images",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "images",
        sa.Column("upload_batch", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "images",
        sa.Column("processing_error", sa.String(length=1000), nullable=True),
    )
    # Matches Image.upload_batch's index=True so a future `/images?batch=` or
    # support query does not seq-scan a table that is all frames, ever.
    op.create_index("ix_images_upload_batch", "images", ["upload_batch"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_images_upload_batch", table_name="images")
    op.drop_column("images", "processing_error")
    op.drop_column("images", "upload_batch")
    op.drop_column("images", "created_at")
