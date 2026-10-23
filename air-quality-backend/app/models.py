from datetime import datetime, timezone
from sqlalchemy import BigInteger, Boolean, CheckConstraint, Float, ForeignKey, Index, Integer, JSON, String, Uuid
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
        Index('ix_measurements_coordinates', 'latitude', 'longitude'),
        Index('ix_measurements_device_time', 'device_id', 'measured_at'),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    measurement_id: Mapped[UUID] = mapped_column(Uuid, unique=True, nullable=False)
    device_id: Mapped[str] = mapped_column(String(255), index=True)
    temperature_c: Mapped[float | None] = mapped_column(Float(53))
    humidity_pct: Mapped[float | None] = mapped_column(Float(53))
    mq135_raw: Mapped[int | None] = mapped_column(BigInteger)
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
