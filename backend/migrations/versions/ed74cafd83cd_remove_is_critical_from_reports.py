"""remove is_critical from reports

Revision ID: ed74cafd83cd
Revises: 3fe8e49d3530
Create Date: 2026-09-28 13:31:14.337639

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ed74cafd83cd'
down_revision: Union[str, Sequence[str], None] = '3fe8e49d3530'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('reports', 'is_critical')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('reports', sa.Column('is_critical', sa.Boolean(), nullable=True))
    op.execute("UPDATE reports SET is_critical = FALSE WHERE is_critical IS NULL;")
    op.alter_column('reports', 'is_critical', nullable=False)
