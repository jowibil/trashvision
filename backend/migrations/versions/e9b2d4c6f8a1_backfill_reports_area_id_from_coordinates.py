"""backfill reports.area_id from coordinates (point-in-polygon)

Revision ID: e9b2d4c6f8a1
Revises: a3f7c1d92b40
Create Date: 2026-10-14

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e9b2d4c6f8a1'
down_revision: Union[str, Sequence[str], None] = 'a3f7c1d92b40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (data-only backfill, fully reversible)."""
    # Mobile submissions never sent an area, so the per-area community pin
    # query (GET /reports/?status=verified&area_id=) never matched any row
    # and the mobile map showed no report pins (bug found 2026-10-14). New
    # submissions are auto-assigned by services/geo_assign.py; this one-time
    # pass assigns the area whose drawn polygon covers each report point.
    #
    # Snapshot EVERY report's current area_id first; downgrade restores all
    # of it exactly, then drops the snapshot. A report can match at most one
    # covering polygon per UPDATE ... FROM pass — if two drawn boundaries
    # ever overlap, Postgres would raise "multiple rows match"; boundaries
    # are jurisdictions and must not, so this is acceptable as a hard error.
    op.execute("""
        CREATE TABLE reports_area_id_backfill_backup AS
        SELECT report_id, area_id AS previous_area_id
        FROM reports;
    """)

    op.execute("""
        UPDATE reports r
        SET area_id = a.area_id
        FROM areas a
        WHERE r.area_id IS NULL
          AND r.geom IS NOT NULL
          AND a.boundary_coordinates IS NOT NULL
          AND ST_Covers(a.boundary_coordinates, r.geom);
    """)


def downgrade() -> None:
    """Downgrade schema (restore pre-backfill values exactly)."""
    op.execute("""
        UPDATE reports r
        SET area_id = b.previous_area_id
        FROM reports_area_id_backfill_backup b
        WHERE b.report_id = r.report_id;
    """)
    op.execute("DROP TABLE IF EXISTS reports_area_id_backfill_backup;")
