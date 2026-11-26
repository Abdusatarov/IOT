from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from app.config import Settings
from app.main import create_app
from app.models import Measurement, SyncReceipt


@pytest.fixture
def hourly(app):
    application = create_app(Settings(database_url=str(app.state.engine.url), api_key=None,
                                     hourly_storage=True, _env_file=None))
    with TestClient(application) as client:
        yield client, application
    application.state.engine.dispose()


def sample(base, minute=0, **values):
    return {**base, 'measurement_id': str(uuid4()), 'mq135_raw': 60,
            'measured_at': f'2026-11-27T10:{minute:02d}:00Z', **values}


def send(client, *rows):
    result = client.post('/api/v1/sync', json={'measurements': list(rows)})
    assert result.status_code == 200, result.text
    return result.json()


def test_exact_means_and_original_ids_acknowledged(hourly, measurement):
    client, app = hourly
    a = sample(measurement, temperature_c=0, humidity_pct=40)
    b = sample(measurement, 20, temperature_c=10, humidity_pct=60, mq135_raw=61, altitude_m=None)
    result = send(client, a, b)
    assert result['accepted'] == 2
    assert [r['measurement_id'] for r in result['results']] == [a['measurement_id'], b['measurement_id']]
    data = client.get('/api/v1/measurements').json()
    assert data['total'] == 1
    row = data['measurements'][0]
    assert row['temperature_c'] == 5
    assert row['humidity_pct'] == 50
    assert row['mq135_raw'] == 60.5
    assert row['sample_count'] == 2
    assert row['hour_start'] == '2026-11-27T10:00:00Z'
    assert row['altitude_m'] is None
    assert client.get('/api/v1/measurements/'+a['measurement_id']).json()['measurement_id'] == row['measurement_id']
    assert client.get('/api/v1/statistics').json()['metrics']['mq135_raw']['avg'] == 60.5
    assert client.get('/api/v1/calendar?year=2026').json()['days'][0]['avg'] == 60.5
    assert client.get('/api/v1/dashboard/snapshot').json()['measurements'][0]['mq135_raw'] == 60.5


def test_zeros_bad_ranges_and_all_invalid_ack(hourly, measurement):
    client, app = hourly
    rows = [sample(measurement, mq135_raw=0, temperature_c=0, humidity_pct=40),
            sample(measurement, 10, mq135_raw=80, temperature_c=100, humidity_pct=120),
            sample(measurement, 20, mq135_raw=0, temperature_c=0, humidity_pct=0)]
    assert send(client, *rows)['accepted'] == 3
    row = client.get('/api/v1/measurements/latest').json()
    assert row['sample_count'] == 2
    assert row['mq135_raw'] == 80
    assert row['temperature_c'] == 0
    assert row['humidity_pct'] == 40
    assert send(client, *rows)['duplicates'] == 3
    with app.state.sessions() as session:
        assert session.scalar(select(func.count()).select_from(SyncReceipt)) == 3
        saved = session.scalar(select(Measurement))
        assert saved.mq135_count == 1 and saved.temperature_count == 1


def test_hour_device_boundaries_utc_and_late_coordinates(hourly, measurement):
    client, _ = hourly
    newest = sample(measurement, 50, latitude=44, longitude=77, altitude_m=15)
    oldest = sample(measurement, 10, latitude=43, longitude=76, altitude_m=None)
    next_hour = sample(measurement, measured_at='2026-11-27T16:00:00+05:00')
    other = sample(measurement, device_id='ESP32-002')
    assert send(client, newest)['accepted'] == 1
    assert send(client, oldest, next_hour, other)['accepted'] == 3
    rows = client.get('/api/v1/measurements').json()
    assert rows['total'] == 3
    hour = next(r for r in rows['measurements'] if r['device_id'] == 'ESP32-001' and r['hour_start'].endswith('10:00:00Z'))
    assert (hour['latitude'], hour['longitude'], hour['altitude_m']) == (44, 77, 15)
    assert hour['sample_count'] == 2
    assert hour['measured_at'].endswith('10:50:00Z')


def test_null_gps_does_not_erase_last_valid_point(hourly, measurement):
    client, _ = hourly
    send(client, sample(measurement))
    send(client, sample(measurement, 20, latitude=None, longitude=None, gps_accuracy_m=None, altitude_m=None))
    row = client.get('/api/v1/measurements/latest').json()
    assert row['latitude'] == measurement['latitude']
    assert row['gps_sample_at'].endswith('10:00:00Z')


def test_duplicates_in_overlapping_concurrent_batches(hourly, measurement):
    _, application = hourly
    rows = [sample(measurement, i, mq135_raw=60+i) for i in range(6)]
    def request(batch):
        with TestClient(application) as client:
            return send(client, *batch)
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(request, [rows[:4], rows[2:], rows]))
    assert sum(r['accepted'] for r in results) == 6
    with TestClient(application) as client:
        row = client.get('/api/v1/measurements/latest').json()
        assert row['sample_count'] == 6 and row['mq135_raw'] == 62.5
        assert client.get('/api/v1/measurements').json()['total'] == 1


def test_legacy_history_kept_and_old_id_retry_not_averaged(client, hourly, measurement):
    hclient, _ = hourly
    old = sample(measurement, mq135_raw=0)
    assert send(client, old)['accepted'] == 1
    assert send(hclient, old)['duplicates'] == 1
    assert hclient.get('/api/v1/measurements/latest').json()['mq135_raw'] is None
    assert hclient.get('/api/v1/dashboard/snapshot').json()['min'] == 0
    assert hclient.get('/api/v1/calendar?year=2026').json()['days'][0]['avg'] is None
    send(hclient, sample(measurement, 10, mq135_raw=90))
    assert hclient.get('/api/v1/measurements').json()['total'] == 2
    assert client.get('/api/v1/measurements').json()['total'] == 2


def test_empty_and_invalid_payloads(hourly, measurement):
    client, _ = hourly
    empty = sample(measurement, mq135_raw=None, temperature_c=None, humidity_pct=None)
    invalid = sample(measurement, measured_at='no-time')
    result = send(client, empty, invalid)
    assert result['accepted'] == 1 and result['rejected'] == 1
    assert result['results'][0]['details'][0]['type'] == 'ignored_empty_sample'
    assert client.get('/api/v1/measurements').json()['total'] == 0
    assert send(client, empty)['duplicates'] == 1


def test_raw_mode_retry_honors_hourly_receipts(client, hourly, measurement):
    hclient, _ = hourly
    record = sample(measurement)
    assert send(hclient, record)['accepted'] == 1
    assert send(client, record)['duplicates'] == 1
    assert client.get('/api/v1/measurements').json()['total'] == 1
