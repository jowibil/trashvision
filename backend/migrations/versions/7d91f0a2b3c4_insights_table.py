"""insights table (critical-area alerts + monthly digest)

Revision ID: 7d91f0a2b3c4
Revises: e9b2d4c6f8a1
Create Date: 2026-10-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '7d91f0a2b3c4'
down_revision: Union[str, Sequence[str], None] = 'e9b2d4c6f8a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the insights table (fully reversible)."""
    # area_id/severity/top_type/change_pct are nullable ONLY so a monthly
    # digest row (kind='digest', one row per month, no single area) can share
    # the table without inventing a second table. Alert rows (kind='alert')
    # always carry area_id + severity; the ORM layer enforces that.
    op.create_table(
        'insights',
        sa.Column('insight_id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('kind', sa.String(), nullable=False, server_default='alert'),
        sa.Column('area_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('areas.area_id'), nullable=True),
        sa.Column('severity', sa.String(), nullable=True),
        sa.Column('detection_count', sa.Integer(), nullable=True),
        sa.Column('top_type', sa.String(), nullable=True),
        sa.Column('top_type_pct', sa.Float(), nullable=True),
        sa.Column('change_pct', sa.Float(), nullable=True),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
        sa.Column('acknowledged_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.user_id'), nullable=True),
        sa.CheckConstraint("kind IN ('alert', 'digest')", name='ck_insights_kind'),
    )
    # Banner/card queries: unacknowledged alerts per area, newest first.
    op.create_index('ix_insights_area_created', 'insights', ['area_id', 'created_at'])
    # Digest lookups + "any alerts at all" listing (kind + acknowledgment).
    op.create_index('ix_insights_kind_created', 'insights', ['kind', 'created_at'])


def downgrade() -> None:
    """Drop the insights table (no data we need to preserve)."""
    op.drop_index('ix_insights_kind_created', table_name='insights')
    op.drop_index('ix_insights_area_created', table_name='insights')
    op.drop_table('insights')
