from uuid import uuid5, NAMESPACE_URL
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from .models import Measurement, ProcessedMeasurement, SyncReceipt
from .schemas import MeasurementIn, SyncResult, ItemResult
from .processing import process_saved
from .quality import clean_values
from .service import validation_details


def sync_hourly(items, sessions, processor):
    results, valid, changed = [], [], set()
    for index, item in enumerate(items):
        try:
            valid.append((index, MeasurementIn.model_validate(item)))
        except ValidationError as exc:
            raw_id = item.get('measurement_id') if isinstance(item, dict) else None
            results.append(ItemResult(index=index, measurement_id=raw_id if isinstance(raw_id, str) else None,
                                      status='rejected', details=validation_details(exc)))
    def bucket(m):
        return m.measured_at.replace(minute=0, second=0, microsecond=0)
    # Consistent group and UUID order prevents cross-batch deadlocks in PostgreSQL.
    with sessions.begin() as session:
        insert = pg_insert if session.bind.dialect.name == 'postgresql' else sqlite_insert
        for index, m in sorted(valid, key=lambda pair: (pair[1].device_id, bucket(pair[1]), str(pair[1].measurement_id), pair[0])):
            details = []
            legacy = session.scalar(select(Measurement.id).where(Measurement.measurement_id == m.measurement_id))
            receipt = None if legacy is not None else session.scalar(insert(SyncReceipt).values(
                measurement_id=m.measurement_id, aggregate_id=None).on_conflict_do_nothing(
                index_elements=['measurement_id']).returning(SyncReceipt.measurement_id))
            if legacy is not None or receipt is None:
                results.append(ItemResult(index=index, measurement_id=str(m.measurement_id), status='duplicate'))
                continue
            values = clean_values(m)
            invalid = [name for name, value in values.items() if value is None and getattr(m, name) is not None]
            if invalid:
                details.append({'type': 'ignored_sensor_values', 'fields': invalid,
                                'message': 'Invalid sensor values excluded from averages'})
            if any(value is not None for value in values.values()):
                hour = bucket(m)
                aggregate_uuid = uuid5(NAMESPACE_URL, f'airmonitor-hour-v1:{m.device_id}:{hour.isoformat()}')
                created = session.scalar(insert(Measurement).values(measurement_id=aggregate_uuid,
                    device_id=m.device_id, hour_start=hour, measured_at=m.measured_at,
                    synced=True, sample_count=0).on_conflict_do_nothing(
                    index_elements=['device_id', 'hour_start']).returning(Measurement.id))
                row = session.scalar(select(Measurement).where(Measurement.device_id == m.device_id,
                    Measurement.hour_start == hour).with_for_update().execution_options(populate_existing=True))
                if created is not None:
                    session.add(ProcessedMeasurement(measurement_id=aggregate_uuid))
                row.sample_count += 1
                for field, prefix in [('temperature_c', 'temperature'), ('humidity_pct', 'humidity'), ('mq135_raw', 'mq135')]:
                    value = values[field]
                    if value is None:
                        continue
                    count = (getattr(row, prefix+'_count') or 0) + 1
                    total = (getattr(row, prefix+'_sum') or 0) + value
                    setattr(row, prefix+'_count', count)
                    setattr(row, prefix+'_sum', total)
                    setattr(row, 'hourly_mq135_mean' if field == 'mq135_raw' else field, total/count)
                row.measured_at = max(row.measured_at, m.measured_at)
                if m.latitude is not None and m.longitude is not None and (row.gps_sample_at is None or m.measured_at > row.gps_sample_at):
                    for name in ['latitude', 'longitude', 'gps_accuracy_m', 'altitude_m']:
                        setattr(row, name, getattr(m, name))
                    row.gps_sample_at = m.measured_at
                session.execute(update(SyncReceipt).where(SyncReceipt.measurement_id == m.measurement_id).values(aggregate_id=row.id))
                changed.add(aggregate_uuid)
            else:
                details.append({'type': 'ignored_empty_sample', 'message': 'No valid sensor values; acknowledged without a measurement row'})
            results.append(ItemResult(index=index, measurement_id=str(m.measurement_id), status='accepted', details=details))
    process_saved(sessions, changed, processor)
    return SyncResult(accepted=sum(r.status == 'accepted' for r in results),
        duplicates=sum(r.status == 'duplicate' for r in results), rejected=sum(r.status == 'rejected' for r in results),
        results=sorted(results, key=lambda r: r.index))
