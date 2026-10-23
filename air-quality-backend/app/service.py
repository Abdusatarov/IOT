from pydantic import ValidationError
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from .models import Measurement, ProcessedMeasurement
from .schemas import MeasurementIn, SyncResult, ItemResult
from .processing import process_saved


def validation_details(exc):
    return [{'field': '.'.join(map(str, e['loc'])), 'message': e['msg'], 'type': e['type']} for e in exc.errors()]


def sync_batch(items, sessions, processor):
    results, new_ids = [], []
    # Sort valid items by UUID to prevent cross-batch lock-order deadlocks.
    valid = []
    for index, item in enumerate(items):
        try:
            valid.append((index, MeasurementIn.model_validate(item)))
        except ValidationError as exc:
            raw_id = item.get('measurement_id') if isinstance(item, dict) else None
            results.append(ItemResult(index=index, measurement_id=raw_id if isinstance(raw_id, str) else None,
                                      status='rejected', details=validation_details(exc)))
    with sessions.begin() as session:
        insert = pg_insert if session.bind.dialect.name == 'postgresql' else sqlite_insert
        for index, measurement in sorted(valid, key=lambda x: (str(x[1].measurement_id), x[0])):
            stmt = insert(Measurement).values(**measurement.model_dump()).on_conflict_do_nothing(
                index_elements=['measurement_id']).returning(Measurement.id)
            row_id = session.scalar(stmt)
            status = 'duplicate' if row_id is None else 'accepted'
            if row_id is not None:
                session.add(ProcessedMeasurement(measurement_id=measurement.measurement_id))
                new_ids.append(measurement.measurement_id)
            results.append(ItemResult(index=index, measurement_id=str(measurement.measurement_id), status=status))
    process_saved(sessions, new_ids, processor)
    return SyncResult(accepted=sum(x.status == 'accepted' for x in results),
                      duplicates=sum(x.status == 'duplicate' for x in results),
                      rejected=sum(x.status == 'rejected' for x in results),
                      results=sorted(results, key=lambda x: x.index))
