from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from app.models import Measurement


def send(client, *items):
    return client.post('/api/v1/sync', json={'measurements': list(items)})


def test_health(client):
    assert client.get('/api/v1/health').json() == {'status': 'ok'}


def test_single(client, measurement):
    response = send(client, measurement)
    assert response.status_code == 200
    assert response.json()['accepted'] == 1
    result = client.get('/api/v1/measurements/' + measurement['measurement_id']).json()
    for key, value in measurement.items():
        if key != 'measured_at':
            assert result[key] == value
    assert result['measured_at'] == '2026-09-30T15:38:54.183000Z'
    assert result['processed']['air_quality_index'] is None
    assert result['processed']['status'] == 'not_calibrated'


def test_multiple(client, measurement):
    rows = [{**measurement, 'measurement_id': str(uuid4())} for _ in range(4)]
    assert send(client, *rows).json()['accepted'] == 4
    assert client.get('/api/v1/measurements').json()['total'] == 4


def test_duplicate_and_immutable(client, app, measurement):
    assert send(client, measurement, measurement).json()['duplicates'] == 1
    result = send(client, {**measurement, 'altitude_m': 999}).json()
    assert result['duplicates'] == 1 and result['accepted'] == 0
    with app.state.sessions() as session:
        assert session.scalar(select(func.count()).select_from(Measurement)) == 1
        assert session.scalar(select(Measurement.altitude_m)) == 512.3


@pytest.mark.parametrize('field,value', [('latitude', 91), ('latitude', -91), ('longitude', 181), ('longitude', -181),
    ('measured_at', 'wrong'), ('measured_at', '2026-09-30T15:38:54'), ('measured_at', 123),
    ('device_id', ''), ('device_id', '   '), ('gps_accuracy_m', -1), ('mq135_raw', 1.2),
    ('altitude_m', '512.3'), ('latitude', True), ('synced', 'false'), ('measurement_id', 'not-uuid')])
def test_invalid_item(client, measurement, field, value):
    result = send(client, {**measurement, field: value}).json()
    assert result['rejected'] == 1 and result['accepted'] == 0
    assert result['results'][0]['details'][0]['field'] == field
    assert client.get('/api/v1/measurements').json()['total'] == 0


@pytest.mark.parametrize('altitude', [None, 512.3, 0, -30.123456789, 512.123456789])
def test_altitude(client, measurement, altitude):
    assert send(client, {**measurement, 'altitude_m': altitude}).json()['accepted'] == 1
    assert client.get('/api/v1/measurements/latest').json()['altitude_m'] == altitude


@pytest.mark.parametrize('raw', [0, 1834, None, -1, 9999999])
def test_mq135(client, measurement, raw):
    assert send(client, {**measurement, 'mq135_raw': raw}).json()['accepted'] == 1
    assert client.get('/api/v1/measurements/latest').json()['mq135_raw'] == raw


def test_partial_batch(client, measurement):
    result = send(client, measurement, {**measurement, 'latitude': 91}, measurement, 42).json()
    assert (result['accepted'], result['duplicates'], result['rejected']) == (1, 1, 2)
    assert [r['status'] for r in result['results']] == ['accepted', 'rejected', 'duplicate', 'rejected']


@pytest.mark.parametrize('body', [{}, {'measurements': []}, {'measurements': {}}, {'measurements': [None] * 1001}])
def test_invalid_envelope(client, body):
    response = client.post('/api/v1/sync', json=body)
    assert response.status_code == 422
    assert response.json()['error'] == 'validation_error'


def test_bad_json(client):
    response = client.post('/api/v1/sync', content='{bad', headers={'Content-Type': 'application/json'})
    assert response.status_code == 400
    assert response.json()['error'] == 'invalid_json'


def test_timezone_normalization(client, measurement):
    send(client, {**measurement, 'measured_at': '2026-09-30T20:38:54.183+05:00'})
    assert client.get('/api/v1/measurements/latest').json()['measured_at'] == '2026-09-30T15:38:54.183000Z'


def test_map_filter_pagination_and_nulls(client, measurement):
    send(client, measurement,
         {**measurement, 'measurement_id': str(uuid4()), 'latitude': None},
         {**measurement, 'measurement_id': str(uuid4()), 'gps_accuracy_m': 100})
    points = client.get('/api/v1/map').json()
    assert points['total'] == 2 and len(points['points']) == 2
    assert points['points'][0]['altitude_m'] == 512.3
    assert client.get('/api/v1/map?max_accuracy_m=50').json()['total'] == 1
    assert client.get('/api/v1/map?from=2026-10-01T00:00:00Z').json()['total'] == 0
    assert len(client.get('/api/v1/map?limit=1&offset=1').json()['points']) == 1
    assert client.get('/api/v1/measurements').json()['total'] == 3


def test_latest_and_filters(client, measurement):
    assert client.get('/api/v1/measurements/latest').status_code == 404
    send(client, measurement, {**measurement, 'measurement_id': str(uuid4()), 'device_id': 'ESP32-002', 'measured_at': '2026-10-01T00:00:00Z'})
    assert client.get('/api/v1/measurements/latest').json()['device_id'] == 'ESP32-002'
    assert client.get('/api/v1/measurements/latest?device_id=ESP32-001').json()['measurement_id'] == measurement['measurement_id']
    assert client.get('/api/v1/map?from=2026-10-01T00:00:00Z&to=2026-09-30T00:00:00Z').status_code == 422
    assert client.get('/api/v1/map?from=2026-10-01T00:00:00').status_code == 422
    assert client.get('/api/v1/measurements/' + str(uuid4())).status_code == 404


def test_statistics(client, measurement):
    send(client, measurement, {**measurement, 'measurement_id': str(uuid4()), 'temperature_c': None, 'altitude_m': None})
    result = client.get('/api/v1/statistics').json()
    assert result['count'] == 2
    assert result['metrics']['temperature_c']['count'] == 1
    assert result['metrics']['altitude_m']['avg'] == 512.3
    assert client.get('/api/v1/recommendations').json()['status'] == 'not_calibrated'


def test_import(client, measurement):
    assert client.post('/api/v1/import', json=[measurement]).json()['accepted'] == 1
    assert client.post('/api/v1/import', json={'measurements': [measurement]}).json()['duplicates'] == 1


def test_processing_failure_preserves_raw(client, app, measurement):
    class BrokenProcessor:
        def process(self, measurement):
            raise RuntimeError('secret detail')
    app.state.processor = BrokenProcessor()
    assert send(client, measurement).json()['accepted'] == 1
    row = client.get('/api/v1/measurements/latest').json()
    assert row['altitude_m'] == 512.3
    assert row['processed']['status'] == 'failed'
    assert 'secret detail' not in str(row)


def test_concurrent_duplicate(app, measurement):
    def request(_):
        with TestClient(app) as client:
            return send(client, measurement).json()
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(request, range(4)))
    assert sum(r['accepted'] for r in results) == 1
    assert sum(r['duplicates'] for r in results) == 3
    with app.state.sessions() as session:
        assert session.scalar(select(func.count()).select_from(Measurement)) == 1


def test_openapi(client):
    schema = client.get('/openapi.json').json()
    assert 'MeasurementIn' in schema['components']['schemas']
    assert 'altitude_m' in schema['components']['schemas']['MeasurementIn']['properties']


def test_key_auth(app, measurement):
    from app.config import Settings
    from app.main import create_app
    secure = create_app(Settings(database_url=app.state.engine.url.render_as_string(hide_password=False), api_key='test-key'))
    with TestClient(secure) as c:
        assert send(c, measurement).status_code == 401
        assert c.get('/api/v1/health').status_code == 200
        assert c.post('/api/v1/sync', json={'measurements': [measurement]}, headers={'X-API-Key': 'test-key'}).json()['accepted'] == 1
    secure.state.engine.dispose()


def test_null_sensors_and_empty_statistics(client, measurement):
    assert client.get('/api/v1/statistics').json()['metrics']['altitude_m']['avg'] is None
    row = {k: v for k, v in measurement.items() if k in ('measurement_id', 'device_id', 'measured_at')}
    assert send(client, row).json()['accepted'] == 1
    assert client.get('/api/v1/map').json()['points'] == []
    assert client.get('/api/v1/measurements/latest').json()['altitude_m'] is None


@pytest.mark.parametrize('field', ['measurement_id', 'device_id', 'measured_at'])
def test_required(client, measurement, field):
    measurement.pop(field)
    assert send(client, measurement).json()['rejected'] == 1


def test_reprocess_failed(client, app, measurement):
    from app.processing import SensorProcessor, process_saved
    from uuid import UUID
    class Broken:
        def process(self, _):
            raise ValueError('broken')
    app.state.processor = Broken()
    send(client, measurement)
    process_saved(app.state.sessions, [UUID(measurement['measurement_id'])], SensorProcessor())
    assert client.get('/api/v1/measurements/latest').json()['processed']['status'] == 'not_calibrated'


def test_no_artificial_sensor_ranges(client, measurement):
    assert send(client, {**measurement, 'humidity_pct': 120, 'temperature_c': -200}).json()['accepted'] == 1


def test_overlapping_concurrent_batches(app, measurement):
    rows = [{**measurement, 'measurement_id': str(uuid4())} for _ in range(5)]
    def request(items):
        with TestClient(app) as client:
            return send(client, *items).json()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(request, [rows, list(reversed(rows))]))
    assert sum(r['accepted'] for r in results) == 5
    assert sum(r['duplicates'] for r in results) == 5


def test_internal_error_is_structured(client, app, measurement, monkeypatch):
    import app.main as main
    def fail(*args):
        raise RuntimeError('private database password')
    monkeypatch.setattr(main, 'sync_batch', fail)
    response = send(client, measurement)
    assert response.status_code == 500
    assert response.json() == {'error': 'internal_server_error', 'details': []}


def test_nonfinite_rejected(client, measurement):
    import json
    response = client.post('/api/v1/sync', content=json.dumps({'measurements': [{**measurement, 'altitude_m': float('inf')}]}), headers={'Content-Type': 'application/json'})
    assert response.json()['rejected'] == 1
