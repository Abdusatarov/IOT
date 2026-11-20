import importlib.util
import threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import httpx

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('viewer_preview', ROOT/'Script/public-preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


def test_viewer_reads_optimized_site_but_never_writes():
    calls = []
    class Origin(BaseHTTPRequestHandler):
        def do_GET(self):
            calls.append((self.path, self.headers.get('X-API-Key')))
            if self.path.startswith('/api/') and self.headers.get('X-API-Key') != 'unit-test-backend-key':
                self.send_error(401)
                return
            body = b'{"measurements":[]}' if self.path.startswith('/api/') else b'demo'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json' if self.path.startswith('/api/') else 'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *_):
            pass
    origin = ThreadingHTTPServer(('127.0.0.1', 0), Origin)
    threading.Thread(target=origin.serve_forever, daemon=True).start()
    gateway = preview.gateway(origin.server_port, backend_api_key='unit-test-backend-key', public_read=True)
    threading.Thread(target=gateway.serve_forever, daemon=True).start()
    try:
        with httpx.Client(base_url=f'http://127.0.0.1:{gateway.server_port}', trust_env=False) as client:
            for path in ['/', '/assets/test.js', '/favicon.svg', '/api/v1/dashboard/snapshot?hour=12', '/api/v1/calendar?year=2026']:
                assert client.get(path).status_code == 200
            assert all(key == 'unit-test-backend-key' for path, key in calls if path.startswith('/api/'))
            count = len(calls)
            for path in ['/.env', '/docs', '/api/v1/import', '/assets/%2e%2e/.env', '/assets/..%5c.env']:
                assert client.get(path).status_code == 403
            assert len(calls) == count
            assert client.post('/api/v1/sync', headers={'X-Sync-Token': 'unit-test-backend-key'}, json={}).status_code == 403
            assert client.delete('/api/v1/measurements').status_code == 403
            assert client.patch('/api/v1/measurements').status_code == 403
    finally:
        gateway.shutdown(); gateway.server_close()
        origin.shutdown(); origin.server_close()
