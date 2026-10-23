import logging
from pydantic import BaseModel, ConfigDict, Field
from .models import Measurement, ProcessedMeasurement, utcnow

logger = logging.getLogger(__name__)


class CalculatedMetrics(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    status: str = 'not_calibrated'
    algorithm_version: str = 'uncalibrated-v1'
    air_quality_index: float | None = None
    pollution_level: str | None = None
    co_ppm: float | None = None
    nh3_ppm: float | None = None
    no2_ppm: float | None = None
    extra_metrics: dict = Field(default_factory=dict)


class SensorProcessor:
    def process(self, measurement: Measurement) -> CalculatedMetrics:
        # MQ-135 raw ADC alone cannot determine AQI or individual gas concentrations.
        return CalculatedMetrics()


def process_saved(sessions, ids, processor):
    """Raw is already committed. A processing failure cannot roll it back."""
    for measurement_id in ids:
        try:
            with sessions.begin() as session:
                from sqlalchemy import select
                measurement = session.scalar(select(Measurement).where(Measurement.measurement_id == measurement_id))
                metrics = session.get(ProcessedMeasurement, measurement.measurement_id)
                try:
                    result = CalculatedMetrics.model_validate(processor.process(measurement))
                    for key, value in result.model_dump().items():
                        setattr(metrics, key, value)
                    metrics.error_code = None
                except Exception:
                    logger.exception('Sensor processor failed for %s', measurement.measurement_id)
                    metrics.status = 'failed'
                    metrics.error_code = 'processing_failed'
                metrics.processed_at = utcnow()
        except Exception:
            # Pending entry is durable and can be retried by scripts/reprocess.py.
            logger.exception('Could not persist processing result for %s', measurement_id)
