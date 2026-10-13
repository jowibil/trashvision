"""add client_report_id to reports (outbox retry idempotency)

Revision ID: a3f7c1d92b40
Revises: f1c2d3e4a5b6
Create Date: 2026-10-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = 'a3f7c1d92b40'
down_revision: Union[str, Sequence[str], None] = 'f1c2d3e4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Mobile's offline outbox retries a report whose server answer arrived
    # after a crash/timeout; without a client-supplied idempotency key every
    # retry inserted a duplicate row (seen 2026-10-14: 2 reports became 4
    # after a server restart). Unique index lets POST /reports/ recognize
    # "already saved" and return the existing report instead.
    op.add_column(
        'reports',
        sa.Column('client_report_id', UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        'ux_reports_client_report_id',
        'reports',
        ['client_report_id'],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ux_reports_client_report_id', table_name='reports')
    op.drop_column('reports', 'client_report_id')
