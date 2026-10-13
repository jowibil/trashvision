"""backfill detection timestamps from flight date

Revision ID: f1c2d3e4a5b6
Revises: b8d4f2a7e951
Create Date: 2026-10-13

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f1c2d3e4a5b6'
down_revision: Union[str, Sequence[str], None] = 'b8d4f2a7e951'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (data only, no DDL)."""
    # detections.timestamp and images.captured_at used to default to the
    # insert clock, so historical flights uploaded late showed up in the
    # upload month instead of the flight month on the map. flight_date is
    # the intended source of truth: re-derive both columns from it.
    #
    # Take a pg_dump before running: the old insert-time timestamps are NOT
    # recoverable (downgrade is a no-op). Assignments cast date -> timestamp
    # (midnight) implicitly; captured_at is timestamptz, so the same value
    # lands under the server's timezone.
    op.execute("""
        UPDATE detections d
        SET timestamp = f.flight_date
        FROM drone_flight_logs f
        WHERE d.flight_id = f.flight_id
          AND f.flight_date IS NOT NULL
    """)
    op.execute("""
        UPDATE images i
        SET captured_at = f.flight_date
        FROM drone_flight_logs f
        WHERE i.flight_id = f.flight_id
          AND f.flight_date IS NOT NULL
    """)


def downgrade() -> None:
    """Downgrade schema."""
    # No-op: the pre-backfill insert-time stamps are unrecoverable (there is
    # nowhere they were stored). Restore from the pre-migration pg_dump if
    # rollback is required.
    pass
