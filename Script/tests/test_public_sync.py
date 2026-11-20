import importlib.util
from pathlib import Path
import os
import subprocess
import sys
import threading
import time
from uuid import uuid4

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('public_preview', ROOT / 'Script/public-preview.py')
PREVIEW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREVIEW)

@pytest.fixture(scope='module')
def public_sync(tmp_path_factory):
    temp = tmp_path_factory.mktemp('internet-sync')
    backend = ROOT / 'air-quality-backend'
    import socket
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    env = {**os.environ, 'DATABASE_URL': 'sqlite:///' + (temp / 'test.db').as_posix(),
           'API_KEY': 'disposable-test-backend-key', 'HOST': '127.0.0.1', 'PORT': str(port)}
    subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], cwd=backend, env=env, check=True, capture_output=True)
    process = subprocess.Popen([sys.executable, '-m', 'app'], cwd=backend, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    server = None
    try:
        with httpx.Client(trust_env=False) as client:
            for _ in range(100):
                try:
                    if client.get(f'http://127.0.0.1:{port}/api/v1/health').status_code == 200: break
                except httpx.TransportError: pass
                time.sleep(.1)
            else: raise RuntimeError('Temporary backend not ready')
        token = PREVIEW.get_sync_token(temp)
        server = PREVIEW.gateway(port, token, env['API_KEY'], public_read=False)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        with httpx.Client(base_url=f'http://127.0.0.1:{server.server_port}', trust_env=False) as client:
            yield client, token
    finally:
        if server: server.shutdown(); server.server_close()
        process.terminate(); process.wait(timeout=10)

def row(altitude=None):
    return dict(measurement_id=str(uuid4()), device_id='INTERNET-TEST', temperature_c=24.6,
                humidity_pct=36.5, mq135_raw=62, latitude=None, longitude=None,
                gps_accuracy_m=None, altitude_m=altitude, measured_at='2026-11-18T17:00:00Z', synced=False)

def test_sync_requires_token(public_sync):
    client, token = public_sync
    assert client.post('/api/v1/sync', json={'measurements':[row()]}).status_code == 401
    assert client.post('/api/v1/sync', headers={'X-Sync-Token':'wrong'}, json={'measurements':[row()]}).status_code == 401
    assert client.get('/api/v1/health').json() == {'status':'ok'}

def test_sync_partial_duplicates_null_and_numeric_altitude(public_sync):
    client, token = public_sync
    a,b=row(),row(512.3)
    response=client.post('/api/v1/sync',headers={'X-Sync-Token':token},json={'measurements':[a,b,a,{**row(),'latitude':91} ]})
    assert response.status_code==200
    body=response.json()
    assert (body['accepted'],body['duplicates'],body['rejected'])==(2,1,1)
    assert [r['status'] for r in body['results']]==['accepted','accepted','duplicate','rejected']
    again=client.post('/api/v1/sync',headers={'X-Sync-Token':token},json={'measurements':[a,b]}).json()
    assert again['duplicates']==2 and again['accepted']==0

def test_other_writes_stay_blocked(public_sync):
    client,token=public_sync
    headers={'X-Sync-Token':token}
    assert client.post('/api/v1/import',headers=headers,json=[]).status_code==403
    assert client.delete('/api/v1/sync',headers=headers).status_code==403
    assert client.post('/api/v1/sync?bypass=1',headers=headers,json=[]).status_code==403
    assert client.post('/api/v1/sync',headers=headers,content='text').status_code==415

def test_token_is_reused_and_not_regenerated(tmp_path):
    assert PREVIEW.get_sync_token(tmp_path)==PREVIEW.get_sync_token(tmp_path)


def test_internet_does_not_expose_measurement_locations(public_sync):
    client, token = public_sync
    for path in ['/api/v1/map', '/api/v1/measurements', '/api/v1/statistics', '/api/v1/calendar?year=2026']:
        assert client.get(path).status_code == 403
    assert client.get('/').status_code == 200
