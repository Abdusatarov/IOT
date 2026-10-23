"""Run from project root: python -m scripts.reprocess [--all]."""
import argparse
import logging
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from app.config import Settings
from app.db import make_engine
from app.models import ProcessedMeasurement
from app.processing import SensorProcessor, process_saved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--all', action='store_true', help='Recalculate every record with the configured processor')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    engine = make_engine(Settings().database_url)
    sessions = sessionmaker(engine)
    last_id = None
    attempted = 0
    while True:
        query = select(ProcessedMeasurement.measurement_id).order_by(ProcessedMeasurement.measurement_id).limit(500)
        if not args.all:
            query = query.where(ProcessedMeasurement.status.in_(['pending', 'failed']))
        if last_id is not None:
            query = query.where(ProcessedMeasurement.measurement_id > last_id)
        with sessions() as session:
            ids = list(session.scalars(query))
        if not ids:
            break
        process_saved(sessions, ids, SensorProcessor())
        attempted += len(ids)
        last_id = ids[-1]
    engine.dispose()
    print(f'Attempted {attempted} records; inspect processing statuses for results.')


if __name__ == '__main__':
    main()
