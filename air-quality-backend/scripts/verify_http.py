"""Exercise the actual HTTP server against a disposable SQLite database."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from uuid import uuid4

import httpx


def main():
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix='air-monitor-http-') as temp:
        env = {**os.environ, 'DATABASE_URL': 'sqlite:///' + (Path(temp) / 'test.db').as_posix(),
               'HOST': '127.0.0.1', 'PORT': '18001', 'API_KEY': ''}
        subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], cwd=root, env=env, check=True)
        server = subprocess.Popen([sys.executable, '-m', 'app'], cwd=root, env=env,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            with httpx.Client(base_url='http://127.0.0.1:18001', timeout=3, trust_env=False) as client:
                for _ in range(50):
                    try:
                        if client.get('/api/v1/health').status_code == 200:
                            break
                    except httpx.TransportError:
                        pass
                    time.sleep(.1)
                assert client.get('/api/v1/health').json() == {'status': 'ok'}
                assert client.get('/').status_code == 200
                row = {'measurement_id': str(uuid4()), 'device_id': 'HTTP-VERIFY',
                       'temperature_c': 24.6, 'humidity_pct': 36.5, 'mq135_raw': 0,
                       'latitude': 51.23, 'longitude': 51.37, 'gps_accuracy_m': 100,
                       'altitude_m': None, 'measured_at': '2026-10-29T12:00:00+05:00'}
                number = {**row, 'measurement_id': str(uuid4()), 'altitude_m': 512.3}
                response = client.post('/api/v1/sync', json={'measurements': [row, number, row, {**row, 'latitude': 91}]})
                assert response.status_code == 200
                result = response.json()
                assert (result['accepted'], result['duplicates'], result['rejected']) == (2, 1, 1)
                for expected in (row, number):
                    saved = client.get('/api/v1/measurements/' + expected['measurement_id']).json()
                    assert saved['altitude_m'] == expected['altitude_m']
                    assert saved['measured_at'] == '2026-10-29T07:00:00Z'
                    assert saved['processed']['air_quality_index'] is None
                assert client.get('/api/v1/map').json()['total'] == 2
                print('HTTP OK: health, web map, sync accepted=2 duplicate=1 rejected=1; null/number altitude; UTC; AQI=null; map=2')
        finally:
            if os.name == 'nt':
                # The Windows venv launcher owns a child interpreter.
                subprocess.run(['taskkill', '/PID', str(server.pid), '/T', '/F'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            else:
                server.terminate()
            server.wait(timeout=10)


if __name__ == '__main__':
    main()
