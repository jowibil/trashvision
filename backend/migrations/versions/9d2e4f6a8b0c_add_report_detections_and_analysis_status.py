"""add report_detections and reports.analysis_status

Revision ID: 9d2e4f6a8b0c
Revises: 7d91f0a2b3c4
Create Date: 2026-10-27

Verified-report → YOLO inference (report_inference_design.md, approved):
one raw YOLO box row per report photo detection + a per-report analysis
status. NO drone-side tables touched; report detections never feed CCI /
hexbins / TrashLog rollups (design D5).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = '9d2e4f6a8b0c'
down_revision: Union[str, Sequence[str], None] = '7d91f0a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ANALYSIS_STATUSES = ('pending', 'running', 'completed', 'failed')


def upgrade() -> None:
    """Upgrade schema."""
    row_enum = sa.Enum(*_ANALYSIS_STATUSES, name='report_analysis_status')
    row_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'report_detections',
        sa.Column('report_detection_id', UUID(as_uuid=True), primary_key=True),
        sa.Column(
            'report_id',
            UUID(as_uuid=True),
            sa.ForeignKey('reports.report_id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('waste_type', sa.String(), nullable=False),
        sa.Column('confidence_score', sa.Float(), nullable=False),
        sa.Column('bbox_x1', sa.Float(), nullable=False),
        sa.Column('bbox_y1', sa.Float(), nullable=False),
        sa.Column('bbox_x2', sa.Float(), nullable=False),
        sa.Column('bbox_y2', sa.Float(), nullable=False),
        sa.Column('image_url', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index(
        'ix_report_detections_report_id',
        'report_detections',
        ['report_id'],
    )

    # server_default keeps pre-existing verified rows valid at ADD time; the
    # default is dropped again immediately (design 3.3) so future inserts are
    # governed by the ORM default, not a stale schema default.
    analysis_enum = sa.Enum(*_ANALYSIS_STATUSES, name='report_analysis_status')
    op.add_column(
        'reports',
        sa.Column(
            'analysis_status',
            analysis_enum,
            nullable=False,
            server_default='pending',
        ),
    )
    op.alter_column('reports', 'analysis_status', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('reports', 'analysis_status')
    op.drop_index('ix_report_detections_report_id', table_name='report_detections')
    op.drop_table('report_detections')
    sa.Enum(
        *_ANALYSIS_STATUSES, name='report_analysis_status'
    ).drop(op.get_bind(), checkfirst=True)
