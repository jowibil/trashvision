"""Password reset table

Revision ID: ca5cb095c123
Revises: 9cb9d1da9e6f
Create Date: 2026-04-24 00:53:05.935496

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ca5cb095c123'
down_revision: Union[str, Sequence[str], None] = '9cb9d1da9e6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        'password_resets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('code', sa.String(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('used', sa.Boolean(), nullable=True, server_default="false"),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_password_resets_email'), 'password_resets', ['email'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    pass
