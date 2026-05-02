"""update column

Revision ID: 9cb9d1da9e6f
Revises: 9c6ad0b483ab
Create Date: 2026-04-24 00:20:49.866734

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9cb9d1da9e6f'
down_revision: Union[str, Sequence[str], None] = '9c6ad0b483ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.alter_column(
        'users',
        'created_at',
        server_default=sa.func.now()
    )

def downgrade():
    op.alter_column(
        'users',
        'created_at',
        server_default=None
    )
