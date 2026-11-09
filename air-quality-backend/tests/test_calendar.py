def test_calendar_utc_nulls_and_device_filter(client, measurement):
    from uuid import uuid4
    row = {**measurement, 'measured_at': '2026-01-01T01:00:00+05:00', 'mq135_raw': 100}
    other = {**row, 'measurement_id': str(uuid4()), 'device_id': 'other', 'mq135_raw': 300}
    null = {**row, 'measurement_id': str(uuid4()), 'mq135_raw': None}
    assert client.post('/api/v1/sync', json={'measurements': [row, other, null]}).json()['accepted'] == 3
    assert client.get('/api/v1/calendar?year=2026').json()['days'] == []
    result = client.get('/api/v1/calendar?year=2025').json()
    assert result['days'] == [{'date': '2025-12-31', 'count': 3, 'avg': 200, 'min': 100, 'max': 300}]
    filtered = client.get('/api/v1/calendar?year=2025&device_id=ESP32-001').json()
    assert filtered['days'][0]['avg'] == 100
    assert filtered['days'][0]['count'] == 2
    assert client.get('/api/v1/calendar?year=9999').status_code == 422
