from datetime import datetime, timezone
from typing import Any, Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, field_validator

Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class MeasurementIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    measurement_id: UUID
    device_id: Annotated[StrictStr, Field(min_length=1, max_length=255)]
    temperature_c: Number | None = None
    humidity_pct: Number | None = None
    mq135_raw: Annotated[StrictInt, Field(ge=-(2**63), le=2**63-1)] | None = None
    latitude: Annotated[Number, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[Number, Field(ge=-180, le=180)] | None = None
    altitude_m: Number | None = None
    gps_accuracy_m: Annotated[Number, Field(ge=0)] | None = None
    measured_at: datetime
    synced: StrictBool = False

    @field_validator('device_id')
    @classmethod
    def device_not_blank(cls, value):
        if not value.strip():
            raise ValueError('device_id must not be blank')
        return value

    @field_validator('measured_at', mode='before')
    @classmethod
    def timestamp_string(cls, value):
        if not isinstance(value, str) or 'T' not in value:
            raise ValueError('Expected ISO-8601 timestamp with timezone')
        return value

    @field_validator('measured_at')
    @classmethod
    def timestamp_utc(cls, value):
        if value.tzinfo is None:
            raise ValueError('Timezone required: use Z or UTC offset')
        return value.astimezone(timezone.utc)


class BatchIn(BaseModel):
    model_config = ConfigDict(extra='forbid')
    # Any permits per-item validation and partial acceptance. See MeasurementIn in OpenAPI.
    measurements: list[Any] = Field(min_length=1, max_length=1000)


class ItemResult(BaseModel):
    index: int
    measurement_id: str | None
    status: Literal['accepted', 'duplicate', 'rejected']
    details: list[dict] = Field(default_factory=list)


class SyncResult(BaseModel):
    accepted: int
    duplicates: int
    rejected: int
    results: list[ItemResult]


class MetricsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    status: str
    algorithm_version: str
    air_quality_index: float | None
    pollution_level: str | None
    co_ppm: float | None
    nh3_ppm: float | None
    no2_ppm: float | None
    extra_metrics: dict
    error_code: str | None
    processed_at: datetime | None


class MeasurementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    measurement_id: UUID
    device_id: str
    temperature_c: float | None
    humidity_pct: float | None
    mq135_raw: int | None
    latitude: float | None
    longitude: float | None
    altitude_m: float | None
    gps_accuracy_m: float | None
    measured_at: datetime
    synced: bool
    created_at: datetime
    processed: MetricsOut
