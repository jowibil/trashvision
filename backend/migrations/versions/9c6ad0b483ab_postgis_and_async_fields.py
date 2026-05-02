"""postgis and async fields

Revision ID: 9c6ad0b483ab
Revises: 61645b3d62c3
Create Date: 2026-04-23 00:07:36.726119

"""
from typing import Sequence, Union
import geoalchemy2
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '9c6ad0b483ab'
down_revision: Union[str, Sequence[str], None] = '61645b3d62c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

processing_status_enum = sa.Enum(
    'pending', 'processing', 'done', 'failed',
    name='processing_status'
)

report_status_enum = sa.Enum(
    'pending', 'verified', 'resolved', 'rejected',
    name='report_status'
)

def upgrade() -> None:
    """Upgrade schema."""
    processing_status_enum.create(op.get_bind(), checkfirst=True)
    report_status_enum.create(op.get_bind(), checkfirst=True)
    op.execute("""
        ALTER TABLE reports
        ALTER COLUMN status TYPE report_status
        USING status::report_status;""")
    
    op.alter_column('areas', 'boundary_coordinates', existing_type=sa.TEXT(), type_=geoalchemy2.types.Geometry('POLYGON', srid=4326), existing_nullable=True)
    op.create_index('idx_areas_boundary_coordinates', 'areas', ['boundary_coordinates'], unique=False, postgresql_using='gist')
    op.add_column('detections',sa.Column('geom', geoalchemy2.types.Geometry('POINT', srid=4326), nullable=True))
    op.create_index(
    'idx_detections_geom',
    'detections',
    ['geom'],
    unique=False,
    postgresql_using='gist',
    if_not_exists=True
)
    op.drop_column('detections', 'longitude')
    op.drop_column('detections', 'latitude')
    op.add_column('images', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('images', sa.Column('longitude', sa.Float(), nullable=True))
    op.add_column('images', sa.Column('altitude', sa.Float(), nullable=True))
    op.add_column('images', sa.Column('processing_status', processing_status_enum, nullable=True))
    op.add_column('reports', sa.Column('geom', geoalchemy2.types.Geometry('POINT', srid=4326), nullable=True))
    op.alter_column('reports', 'status', existing_type=sa.VARCHAR(), type_=report_status_enum, existing_nullable=True)
    op.create_index('idx_reports_geom', 'reports', ['geom'], unique=False, postgresql_using='gist', if_not_exists=True)
    op.drop_column('reports', 'longitude')
    op.drop_column('reports', 'latitude')
    op.add_column('users', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_login', sa.DateTime(timezone=True), nullable=True))
    op.alter_column('users', 'created_at', existing_type=postgresql.TIMESTAMP(), type_=sa.DateTime(timezone=True), existing_nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column( 'users', 'created_at', existing_type=sa.DateTime(timezone=True), type_=postgresql.TIMESTAMP(), existing_nullable=True)
    op.drop_column('users', 'last_login')
    op.drop_column('users', 'updated_at')
    op.add_column('reports', sa.Column('latitude', sa.Float(), nullable=False))
    op.add_column('reports', sa.Column('longitude', sa.Float(), nullable=False))
    op.drop_index('idx_reports_geom', table_name='reports', postgresql_using='gist')
    op.alter_column( 'reports', 'status', existing_type=report_status_enum, type_=sa.VARCHAR(), existing_nullable=True)
    op.drop_column('reports', 'geom')
    op.drop_column('images', 'processing_status')
    op.drop_column('images', 'altitude')
    op.drop_column('images', 'longitude')
    op.drop_column('images', 'latitude')
    op.add_column('detections', sa.Column('latitude', sa.Float(), nullable=False))
    op.add_column('detections', sa.Column('longitude', sa.Float(), nullable=False))
    op.drop_index('idx_detections_geom', table_name='detections', postgresql_using='gist')
    op.drop_column('detections', 'geom')
    op.drop_index('idx_areas_boundary_coordinates', table_name='areas', postgresql_using='gist')
    op.alter_column('areas', 'boundary_coordinates', existing_type=geoalchemy2.types.Geometry('POLYGON', srid=4326), type_=sa.TEXT(), existing_nullable=True)

    processing_status_enum.drop(op.get_bind(), checkfirst=True)
    report_status_enum.drop(op.get_bind(), checkfirst=True)
    op.create_table('spatial_ref_sys',
    sa.Column('srid', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.Column('auth_name', sa.VARCHAR(length=256), autoincrement=False, nullable=True),
    sa.Column('auth_srid', sa.INTEGER(), autoincrement=False, nullable=True),
    sa.Column('srtext', sa.VARCHAR(length=2048), autoincrement=False, nullable=True),
    sa.Column('proj4text', sa.VARCHAR(length=2048), autoincrement=False, nullable=True),
    sa.CheckConstraint('srid > 0 AND srid <= 998999', name=op.f('spatial_ref_sys_srid_check')),
    sa.PrimaryKeyConstraint('srid', name=op.f('spatial_ref_sys_pkey'))
    )
    # ### end Alembic commands ###
