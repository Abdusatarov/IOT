from uuid import uuid4
from datetime import datetime, timedelta, timezone


def test_snapshot_is_latest_per_device_and_keeps_quiet_devices(client, measurement):
    end = datetime(2026, 11, 20, 12, tzinfo=timezone.utc)
    records = []
    for device, hours, raw in [('A', 48, 50), ('A', 0, 0), ('B', 240, 100), ('C', 1, 75)]:
        records.append({**measurement, 'measurement_id': str(uuid4()), 'device_id': device,
                        'measured_at': (end-timedelta(hours=hours)).isoformat(), 'mq135_raw': raw})
    assert client.post('/api/v1/sync', json={'measurements': records}).status_code == 200
    result = client.get('/api/v1/dashboard/snapshot').json()
    assert result['total'] == 4
    assert result['devices'] == ['A', 'B', 'C']
    assert result['min'] == 0 and result['max'] == 100
    assert {r['device_id']: r['mq135_raw'] for r in result['measurements']} == {'A': 0, 'B': 100, 'C': 75}
    earlier = client.get('/api/v1/dashboard/snapshot?hour=0').json()
    assert {r['device_id']: r['mq135_raw'] for r in earlier['measurements']} == {'A': 50, 'B': 100}
    assert earlier['devices'] == ['A', 'B', 'C']
    assert datetime.fromisoformat(earlier['cutoff'].replace('Z', '+00:00')) == end-timedelta(hours=24)
    assert len(result['measurements']) < result['total']


def test_snapshot_empty_and_validation(client):
    result = client.get('/api/v1/dashboard/snapshot').json()
    assert result['measurements'] == [] and result['devices'] == []
    assert result['end'] is None and result['total'] == 0
    assert result['min'] == 0 and result['max'] == 4095
    assert client.get('/api/v1/dashboard/snapshot?hour=-1').status_code == 422
    assert client.get('/api/v1/dashboard/snapshot?hour=25').status_code == 422


def test_snapshot_authentication(app):
    from app.main import create_app
    from app.config import Settings
    from fastapi.testclient import TestClient
    protected = create_app(Settings(database_url=str(app.state.engine.url), api_key='unit-test-key', _env_file=None))
    try:
        with TestClient(protected) as client:
            assert client.get('/api/v1/dashboard/snapshot').status_code == 401
            assert client.get('/api/v1/dashboard/snapshot', headers={'X-API-Key': 'unit-test-key'}).status_code == 200
    finally:
        protected.state.engine.dispose()


def test_snapshot_null_coordinates_and_ties(client, measurement):
    records = [{**measurement, 'measurement_id': str(uuid4()), 'mq135_raw': value,
                'latitude': None, 'longitude': None} for value in [7, 11]]
    client.post('/api/v1/sync', json={'measurements': records})
    result = client.get('/api/v1/dashboard/snapshot').json()
    assert len(result['measurements']) == 1
    ordered = client.get('/api/v1/measurements').json()['measurements']
    assert result['measurements'][0]['measurement_id'] == ordered[0]['measurement_id']
    assert result['measurements'][0]['mq135_raw'] == ordered[0]['mq135_raw']
    assert result['measurements'][0]['latitude'] is None
