"""add users.password_changed_at for token revocation

Revision ID: a8c3d1e4f7b2
Revises: b4e8d1c6a2f5
Create Date: 2026-10-28

Pre-Deployment Checklist item: tokens must be invalidated on password
change. JWTs live up to 30 days (ACCESS_TOKEN_EXPIRE_MINUTES=43200); the
column records when a password was last changed so get_current_user can
reject any token issued before it. Nullable on purpose: NULL means "never
changed since this mechanism was deployed" — existing tokens keep working
and nobody is logged out by this migration itself.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a8c3d1e4f7b2'
down_revision: Union[str, Sequence[str], None] = 'b4e8d1c6a2f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'password_changed_at')
