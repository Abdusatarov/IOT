from datetime import datetime, timezone
from sqlalchemy import func, BigInteger, Boolean, CheckConstraint, Float, ForeignKey, Index, Integer, JSON, String, Uuid
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base, UTCDateTime
from uuid import UUID


def utcnow():
    return datetime.now(timezone.utc)


class Measurement(Base):
    __tablename__ = 'measurements'
    __table_args__ = (
        CheckConstraint('latitude IS NULL OR latitude BETWEEN -90 AND 90', name='ck_latitude'),
        CheckConstraint('longitude IS NULL OR longitude BETWEEN -180 AND 180', name='ck_longitude'),
        CheckConstraint('gps_accuracy_m IS NULL OR gps_accuracy_m >= 0', name='ck_accuracy'),
        Index('uq_measurements_device_hour', 'device_id', 'hour_start', unique=True),
        Index('ix_measurements_coordinates', 'latitude', 'longitude'),
        Index('ix_measurements_device_time', 'device_id', 'measured_at'),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    measurement_id: Mapped[UUID] = mapped_column(Uuid, unique=True, nullable=False)
    device_id: Mapped[str] = mapped_column(String(255), index=True)
    temperature_c: Mapped[float | None] = mapped_column(Float(53))
    humidity_pct: Mapped[float | None] = mapped_column(Float(53))
    _mq135_raw: Mapped[int | None] = mapped_column('mq135_raw', BigInteger)
    hourly_mq135_mean: Mapped[float | None] = mapped_column(Float(53))
    hour_start: Mapped[datetime | None] = mapped_column(UTCDateTime)
    sample_count: Mapped[int | None] = mapped_column(Integer)
    temperature_sum: Mapped[float | None] = mapped_column(Float(53))
    temperature_count: Mapped[int | None] = mapped_column(Integer)
    humidity_sum: Mapped[float | None] = mapped_column(Float(53))
    humidity_count: Mapped[int | None] = mapped_column(Integer)
    mq135_sum: Mapped[float | None] = mapped_column(Float(53))
    mq135_count: Mapped[int | None] = mapped_column(Integer)
    gps_sample_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    @hybrid_property
    def mq135_raw(self):
        return self.hourly_mq135_mean if self.hourly_mq135_mean is not None else self._mq135_raw

    @mq135_raw.setter
    def mq135_raw(self, value):
        self._mq135_raw = value

    @mq135_raw.inplace.expression
    @classmethod
    def _mq135_expression(cls):
        return func.coalesce(cls.hourly_mq135_mean, cls._mq135_raw)

    latitude: Mapped[float | None] = mapped_column(Float(53))
    longitude: Mapped[float | None] = mapped_column(Float(53))
    altitude_m: Mapped[float | None] = mapped_column(Float(53))
    gps_accuracy_m: Mapped[float | None] = mapped_column(Float(53))
    measured_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    synced: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    processed: Mapped['ProcessedMeasurement'] = relationship(lazy='selectin', cascade='all, delete-orphan', uselist=False)


class ProcessedMeasurement(Base):
    __tablename__ = 'processed_measurements'
    measurement_id: Mapped[UUID] = mapped_column(ForeignKey('measurements.measurement_id', ondelete='CASCADE'), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), default='pending', index=True)
    algorithm_version: Mapped[str] = mapped_column(String(100), default='uncalibrated-v1')
    air_quality_index: Mapped[float | None] = mapped_column(Float(53))
    pollution_level: Mapped[str | None] = mapped_column(String(50))
    co_ppm: Mapped[float | None] = mapped_column(Float(53))
    nh3_ppm: Mapped[float | None] = mapped_column(Float(53))
    no2_ppm: Mapped[float | None] = mapped_column(Float(53))
    extra_metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    error_code: Mapped[str | None] = mapped_column(String(100))
    processed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class SyncReceipt(Base):
    __tablename__ = 'sync_receipts'
    __table_args__ = {'sqlite_with_rowid': False}
    measurement_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    aggregate_id: Mapped[int | None] = mapped_column(ForeignKey('measurements.id', ondelete='SET NULL'))
