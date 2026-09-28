"""Two-stage DBSCAN

Revision ID: 782ef2c96f10
Revises: ed2aed22dd46
Create Date: 2026-08-09 23:53:57.025255

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '782ef2c96f10'
down_revision: Union[str, Sequence[str], None] = 'ed2aed22dd46'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema safely."""
    # 1. Update PostgreSQL ENUM type to support Stage A duplicate status
    op.execute("ALTER TYPE processing_status ADD VALUE IF NOT EXISTS 'duplicate_skipped'")

    # 2. Add Stage B fields to detections table with server_defaults
    op.add_column('detections', sa.Column('duplicate_count', sa.Integer(), server_default='1', nullable=False))
    op.add_column('detections', sa.Column('cluster_id', sa.String(), nullable=True))
    op.alter_column('detections', 'flight_id',
               existing_type=sa.UUID(),
               nullable=False)
               
    # Drop legacy PostGIS/Image-level columns on detections
    op.drop_index(op.f('idx_detections_geom'), table_name='detections', postgresql_using='gist')
    op.drop_index(op.f('idx_detections_spatial_geom'), table_name='detections', postgresql_using='gist')
    op.drop_constraint(op.f('detections_image_id_fkey'), 'detections', type_='foreignkey')
    op.drop_constraint(op.f('detections_user_id_fkey'), 'detections', type_='foreignkey')
    op.drop_column('detections', 'user_id')
    op.drop_column('detections', 'image_id')
    op.drop_column('detections', 'geom')
    op.drop_column('detections', 'is_manual')

    # 3. Add Stage A fields to images table with server_defaults
    op.add_column('images', sa.Column('asset_url', sa.String(), server_default='', nullable=False))
    op.add_column('images', sa.Column('is_representative', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('images', sa.Column('cluster_id', sa.String(), nullable=True))
    op.alter_column('images', 'flight_id',
               existing_type=sa.UUID(),
               nullable=False)
    op.alter_column('images', 'latitude',
               existing_type=sa.DOUBLE_PRECISION(precision=53),
               nullable=False)
    op.alter_column('images', 'longitude',
               existing_type=sa.DOUBLE_PRECISION(precision=53),
               nullable=False)
    op.alter_column('images', 'captured_at',
               existing_type=postgresql.TIMESTAMP(),
               type_=sa.DateTime(timezone=True),
               existing_nullable=True)
    op.alter_column('images', 'processing_status',
               existing_type=postgresql.ENUM('pending', 'processing', 'done', 'failed', 'duplicate_skipped', name='processing_status'),
               nullable=False)


def downgrade() -> None:
    """Downgrade schema cleanly."""
    op.alter_column('images', 'processing_status',
               existing_type=postgresql.ENUM('pending', 'processing', 'done', 'failed', 'duplicate_skipped', name='processing_status'),
               nullable=True)
    op.alter_column('images', 'captured_at',
               existing_type=sa.DateTime(timezone=True),
               type_=postgresql.TIMESTAMP(),
               existing_nullable=True)
    op.alter_column('images', 'longitude',
               existing_type=sa.DOUBLE_PRECISION(precision=53),
               nullable=True)
    op.alter_column('images', 'latitude',
               existing_type=sa.DOUBLE_PRECISION(precision=53),
               nullable=True)
    op.alter_column('images', 'flight_id',
               existing_type=sa.UUID(),
               nullable=True)
    op.drop_column('images', 'cluster_id')
    op.drop_column('images', 'is_representative')
    op.drop_column('images', 'asset_url')
    
    op.add_column('detections', sa.Column('is_manual', sa.BOOLEAN(), autoincrement=False, nullable=True))
    op.add_column('detections', sa.Column('geom', sa.NullType(), autoincrement=False, nullable=True))
    op.add_column('detections', sa.Column('image_id', sa.UUID(), autoincrement=False, nullable=True))
    op.add_column('detections', sa.Column('user_id', sa.UUID(), autoincrement=False, nullable=True))
    op.create_foreign_key(op.f('detections_user_id_fkey'), 'detections', 'users', ['user_id'], ['user_id'])
    op.create_foreign_key(op.f('detections_image_id_fkey'), 'detections', 'images', ['image_id'], ['image_id'])
    op.alter_column('detections', 'flight_id',
               existing_type=sa.UUID(),
               nullable=True)
    op.drop_column('detections', 'cluster_id')
    op.drop_column('detections', 'duplicate_count')