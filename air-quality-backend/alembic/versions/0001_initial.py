"""Raw measurements and independent versioned processing results."""
from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('measurements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('measurement_id', sa.Uuid(), nullable=False),
        sa.Column('device_id', sa.String(255), nullable=False),
        sa.Column('temperature_c', sa.Float(53)),
        sa.Column('humidity_pct', sa.Float(53)),
        sa.Column('mq135_raw', sa.BigInteger()),
        sa.Column('latitude', sa.Float(53)),
        sa.Column('longitude', sa.Float(53)),
        sa.Column('altitude_m', sa.Float(53)),
        sa.Column('gps_accuracy_m', sa.Float(53)),
        sa.Column('measured_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('synced', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('measurement_id', name='uq_measurements_measurement_id'),
        sa.CheckConstraint('latitude IS NULL OR latitude BETWEEN -90 AND 90', name='ck_latitude'),
        sa.CheckConstraint('longitude IS NULL OR longitude BETWEEN -180 AND 180', name='ck_longitude'),
        sa.CheckConstraint('gps_accuracy_m IS NULL OR gps_accuracy_m >= 0', name='ck_accuracy'))
    for name, columns in [('device_id', ['device_id']), ('measured_at', ['measured_at']),
                          ('coordinates', ['latitude', 'longitude']), ('device_time', ['device_id', 'measured_at'])]:
        op.create_index('ix_measurements_' + name, 'measurements', columns)
    op.create_table('processed_measurements',
        sa.Column('measurement_id', sa.Uuid(), sa.ForeignKey('measurements.measurement_id', ondelete='CASCADE'), primary_key=True),
        sa.Column('status', sa.String(32), nullable=False),
        sa.Column('algorithm_version', sa.String(100), nullable=False),
        sa.Column('air_quality_index', sa.Float(53)),
        sa.Column('pollution_level', sa.String(50)),
        sa.Column('co_ppm', sa.Float(53)),
        sa.Column('nh3_ppm', sa.Float(53)),
        sa.Column('no2_ppm', sa.Float(53)),
        sa.Column('extra_metrics', sa.JSON(), nullable=False),
        sa.Column('error_code', sa.String(100)),
        sa.Column('processed_at', sa.DateTime(timezone=True)))
    op.create_index('ix_processed_measurements_status', 'processed_measurements', ['status'])


def downgrade():
    op.drop_table('processed_measurements')
    op.drop_table('measurements')
