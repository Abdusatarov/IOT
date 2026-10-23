import logging
import secrets
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import sessionmaker
from starlette.exceptions import HTTPException as StarletteHTTPException
from .config import Settings
from .db import make_engine
from .models import Measurement, ProcessedMeasurement
from .processing import SensorProcessor
from .schemas import BatchIn, MeasurementIn, MeasurementOut, SyncResult
from .service import sync_batch, validation_details

logger = logging.getLogger(__name__)


def create_app(settings=None, processor=None):
    settings = settings or Settings()
    app = FastAPI(title='Air Quality IoT API', version='1.0.0', debug=False)
    app.state.engine = make_engine(settings.database_url)
    app.state.sessions = sessionmaker(app.state.engine, expire_on_commit=False)
    app.state.processor = processor or SensorProcessor()
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=['GET', 'POST'], allow_headers=['Content-Type', 'X-API-Key'])

    def authorize(x_api_key: Annotated[str | None, Header()] = None):
        if settings.api_key and not secrets.compare_digest(x_api_key or '', settings.api_key):
            raise HTTPException(401, 'invalid_api_key')

    def session_dependency():
        with app.state.sessions() as session:
            yield session

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        malformed = any(e['type'] == 'json_invalid' for e in exc.errors())
        return JSONResponse(status_code=400 if malformed else 422,
                            content={'error': 'invalid_json' if malformed else 'validation_error', 'details': validation_details(exc)})

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        return JSONResponse(status_code=exc.status_code, content={'error': str(exc.detail), 'details': []}, headers=exc.headers)

    @app.exception_handler(Exception)
    async def server_error(request, exc):
        logger.error('Unhandled request failure', exc_info=exc)
        return JSONResponse(status_code=500, content={'error': 'internal_server_error', 'details': []})

    @app.get('/api/v1/health')
    def health(session=Depends(session_dependency)):
        try:
            session.execute(text('SELECT 1'))
        except Exception:
            raise HTTPException(503, 'database_unavailable')
        return {'status': 'ok'}

    @app.post('/api/v1/sync', response_model=SyncResult, dependencies=[Depends(authorize)])
    def sync(body: BatchIn):
        return sync_batch(body.measurements, app.state.sessions, app.state.processor)

    @app.post('/api/v1/import', response_model=SyncResult, dependencies=[Depends(authorize)])
    def import_json(body: Annotated[BatchIn | list, Body()]):
        if isinstance(body, list):
            if not 1 <= len(body) <= 1000:
                raise HTTPException(422, 'batch_size_must_be_1_to_1000')
            items = body
        else:
            items = body.measurements
        return sync_batch(items, app.state.sessions, app.state.processor)

    def filters(device_id: str | None = None, start: datetime | None = Query(None, alias='from'),
                end: datetime | None = Query(None, alias='to'),
                max_accuracy_m: float | None = Query(None, ge=0, allow_inf_nan=False)):
        for value in (start, end):
            if value is not None and value.tzinfo is None:
                raise HTTPException(422, 'filter_timestamp_requires_timezone')
        if start and end and start > end:
            raise HTTPException(422, 'from_must_not_exceed_to')
        clauses = []
        if device_id is not None:
            clauses.append(Measurement.device_id == device_id)
        if start:
            clauses.append(Measurement.measured_at >= start.astimezone(timezone.utc))
        if end:
            clauses.append(Measurement.measured_at <= end.astimezone(timezone.utc))
        if max_accuracy_m is not None:
            clauses.append(Measurement.gps_accuracy_m <= max_accuracy_m)
        return clauses

    @app.get('/api/v1/measurements', dependencies=[Depends(authorize)])
    def measurements(clauses=Depends(filters), limit: int = Query(100, ge=1, le=1000),
                     offset: int = Query(0, ge=0), session=Depends(session_dependency)):
        rows = session.scalars(select(Measurement).where(*clauses).order_by(Measurement.measured_at.desc(), Measurement.id.desc()).limit(limit).offset(offset)).all()
        total = session.scalar(select(func.count()).select_from(Measurement).where(*clauses))
        return {'total': total, 'limit': limit, 'offset': offset, 'measurements': [MeasurementOut.model_validate(r) for r in rows]}

    @app.get('/api/v1/measurements/latest', response_model=MeasurementOut, dependencies=[Depends(authorize)])
    def latest(clauses=Depends(filters), session=Depends(session_dependency)):
        row = session.scalar(select(Measurement).where(*clauses).order_by(Measurement.measured_at.desc(), Measurement.id.desc()).limit(1))
        if row is None:
            raise HTTPException(404, 'measurement_not_found')
        return row

    @app.get('/api/v1/measurements/{measurement_id}', response_model=MeasurementOut, dependencies=[Depends(authorize)])
    def detail(measurement_id: UUID, session=Depends(session_dependency)):
        row = session.scalar(select(Measurement).where(Measurement.measurement_id == measurement_id))
        if row is None:
            raise HTTPException(404, 'measurement_not_found')
        return row

    @app.get('/api/v1/map', dependencies=[Depends(authorize)])
    def map_points(clauses=Depends(filters), limit: int = Query(1000, ge=1, le=1000),
                   offset: int = Query(0, ge=0), session=Depends(session_dependency)):
        clauses += [Measurement.latitude.is_not(None), Measurement.longitude.is_not(None)]
        rows = session.scalars(select(Measurement).where(*clauses).order_by(Measurement.measured_at.desc(), Measurement.id.desc()).limit(limit).offset(offset)).all()
        fields = ('measurement_id', 'device_id', 'latitude', 'longitude', 'altitude_m', 'gps_accuracy_m', 'temperature_c', 'humidity_pct', 'mq135_raw', 'measured_at')
        points = [{**{f: getattr(r, f) for f in fields}, 'air_quality_index': r.processed.air_quality_index, 'measured_at': r.measured_at.isoformat().replace('+00:00', 'Z')} for r in rows]
        total = session.scalar(select(func.count()).select_from(Measurement).where(*clauses))
        return {'points': points, 'total': total, 'limit': limit, 'offset': offset}

    @app.get('/api/v1/statistics', dependencies=[Depends(authorize)])
    def statistics(clauses=Depends(filters), session=Depends(session_dependency)):
        fields = ('temperature_c', 'humidity_pct', 'mq135_raw', 'altitude_m', 'gps_accuracy_m')
        aggregates = [func.count(Measurement.id)]
        for f in fields:
            col = getattr(Measurement, f)
            aggregates.extend([func.count(col), func.min(col), func.max(col), func.avg(col)])
        row = session.execute(select(*aggregates).where(*clauses)).one()
        return {'count': row[0], 'metrics': {f: dict(zip(('count', 'min', 'max', 'avg'), row[1+i*4:5+i*4])) for i, f in enumerate(fields)}}

    @app.get('/api/v1/recommendations', dependencies=[Depends(authorize)])
    def recommendations():
        return {'status': 'not_calibrated', 'recommendations': [],
                'reason': 'Calibrated pollutant measurements and a selected AQI standard are required.'}

    original_openapi = app.openapi
    def custom_openapi():
        schema = original_openapi()
        schema['components']['schemas']['MeasurementIn'] = MeasurementIn.model_json_schema()
        schema['components']['schemas']['BatchIn']['properties']['measurements']['items'] = {'$ref': '#/components/schemas/MeasurementIn'}
        return schema
    app.openapi = custom_openapi
    return app


app = create_app()
