"""Add hourly accumulators and compact idempotency receipts without rewriting history."""
from alembic import op
import sqlalchemy as sa
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    for name in ['hourly_mq135_mean', 'temperature_sum', 'humidity_sum', 'mq135_sum']:
        op.add_column('measurements', sa.Column(name, sa.Float(53), nullable=True))
    for name in ['sample_count', 'temperature_count', 'humidity_count', 'mq135_count']:
        op.add_column('measurements', sa.Column(name, sa.Integer(), nullable=True))
    for name in ['hour_start', 'gps_sample_at']:
        op.add_column('measurements', sa.Column(name, sa.DateTime(timezone=True), nullable=True))
    op.create_index('uq_measurements_device_hour', 'measurements', ['device_id', 'hour_start'], unique=True)
    op.create_table('sync_receipts',
        sa.Column('measurement_id', sa.Uuid(), primary_key=True),
        sa.Column('aggregate_id', sa.Integer(), sa.ForeignKey('measurements.id', ondelete='SET NULL'), nullable=True),
        sqlite_with_rowid=False)


def downgrade():
    # Downgrading would lose accumulators and exactly-once receipts; require a backup restore.
    raise RuntimeError('Restore a pre-hourly backup to downgrade safely')
