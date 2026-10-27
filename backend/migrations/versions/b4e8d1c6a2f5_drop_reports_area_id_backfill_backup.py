"""drop leftover reports_area_id_backfill_backup

Revision ID: b4e8d1c6a2f5
Revises: 9d2e4f6a8b0c
Create Date: 2026-10-27

Housekeeping, not schema: e9b2d4c6f8a1 (backfill reports.area_id from
coordinates) used reports_area_id_backfill_backup as a one-shot safety copy
and was supposed to drop it at the end, but the drop only landed in the file
AFTER a run that had already executed the older body — so the orphan survived
in existing databases. `alembic check` keeps flagging it as a spurious
"removed table", which poisons every future autogenerate. Fresh databases
(upgrade head from scratch) never saw it; existing ones converge here.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b4e8d1c6a2f5'
down_revision: Union[str, Sequence[str], None] = '9d2e4f6a8b0c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # IF EXISTS: fresh databases legitimately reach this revision without the
    # orphan ever having existed — dropping must be a no-op for them, not an
    # error.
    op.execute("DROP TABLE IF EXISTS reports_area_id_backfill_backup;")


def downgrade() -> None:
    # Deliberately a no-op: the backup's contents were already folded back
    # into reports by e9b2d4c6f8a1 itself — there is nothing to restore, and
    # re-creating an empty residue table would resurrect the exact drift this
    # revision exists to remove. This whole revision is housekeeping only.
    pass
