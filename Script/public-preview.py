"""Public read gateway with token-protected Android sync and verified cloudflared."""
import hashlib
import hmac
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit, unquote
from urllib.request import Request, urlopen


def install_cloudflared(root):
    folder = Path(root) / '.tools'
    folder.mkdir(exist_ok=True)
    binary = folder / 'cloudflared.exe'
    checksum = folder / 'cloudflared.sha256'
    if binary.is_file() and checksum.is_file():
        if hashlib.sha256(binary.read_bytes()).hexdigest() == checksum.read_text().strip():
            return binary
    request = Request('https://api.github.com/repos/cloudflare/cloudflared/releases/latest',
                      headers={'User-Agent': 'AlmatyAir-local-preview'})
    with urlopen(request, timeout=30) as response:
        release = json.load(response)
    asset = next(a for a in release['assets'] if a['name'] == 'cloudflared-windows-amd64.exe')
    digest = asset.get('digest', '')
    if not digest.startswith('sha256:'):
        raise RuntimeError('Official release has no SHA-256 digest. Automatic installation cancelled.')
    url = asset['browser_download_url']
    if not url.startswith('https://github.com/cloudflare/cloudflared/releases/download/'):
        raise RuntimeError('Unexpected download URL')
    temporary = folder / 'cloudflared.download'
    try:
        with urlopen(url, timeout=60) as response, temporary.open('wb') as output:
            while block := response.read(1024 * 1024):
                output.write(block)
        actual = hashlib.sha256(temporary.read_bytes()).hexdigest()
        if actual != digest.removeprefix('sha256:'):
            raise RuntimeError('cloudflared checksum mismatch')
        temporary.replace(binary)
        checksum.write_text(actual)
    finally:
        temporary.unlink(missing_ok=True)
    return binary


def get_sync_token(root):
    folder = Path(root) / '.tools'
    folder.mkdir(exist_ok=True)
    token_file = folder / 'sync-token.txt'
    if token_file.is_file():
        token = token_file.read_text(encoding='utf-8').strip()
        if len(token) < 32:
            raise RuntimeError('Sync token is too short; replace it with a secure token')
        return token
    token = secrets.token_urlsafe(32)
    token_file.write_text(token, encoding='utf-8')
    return token


def gateway(port, sync_token=None, backend_api_key=None, public_read=True):
    class ReadOnly(BaseHTTPRequestHandler):
        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            if '..' in path.split('/') or chr(92) in path:
                self.send_error(403, 'Invalid path')
                return
            if not public_read:
                if path == '/':
                    body = b'Air Monitor sync gateway online. Configure this HTTPS URL and the private sync key in Android.'
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/plain; charset=utf-8')
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                if path != '/api/v1/health':
                    self.send_error(403, 'Measurement browsing is private')
                    return
            allowed = path == '/'  or path.startswith('/assets/') or path in (
                '/favicon.svg', '/api/v1/dashboard/snapshot', '/api/v1/health', '/api/v1/measurements', '/api/v1/calendar',
                '/api/v1/map', '/api/v1/statistics', '/api/v1/recommendations')
            if not allowed or not self.path.startswith('/') or self.path.startswith('//'):
                self.send_error(403, 'Public preview is read-only')
                return
            try:
                headers = {'X-API-Key': backend_api_key} if backend_api_key else {}
                request = Request(f'http://127.0.0.1:{port}' + self.path, headers=headers)
                with urlopen(request, timeout=20) as response:
                    body = response.read()
                    self.send_response(response.status)
                    self.send_header('Content-Type', response.headers.get('Content-Type', 'application/octet-stream'))
                    self.send_header('Content-Length', str(len(body)))
                    self.send_header('X-Content-Type-Options', 'nosniff')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(body)
            except HTTPError as exc:
                self.send_error(exc.code)
            except Exception:
                self.send_error(502, 'Local backend unavailable')

        def do_POST(self):
            if self.path != '/api/v1/sync' or not sync_token:
                self.send_error(403, 'Endpoint not available')
                return
            supplied = self.headers.get('X-Sync-Token', '')
            if not hmac.compare_digest(supplied, sync_token):
                self.send_error(401, 'Invalid sync token')
                return
            if self.headers.get_content_type() != 'application/json':
                self.send_error(415, 'JSON required')
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                self.send_error(400, 'Invalid content length')
                return
            if not 0 < length <= 1024 * 1024 or self.headers.get('Transfer-Encoding'):
                self.send_error(413, 'Batch too large or missing content length')
                return
            self.connection.settimeout(15)
            try:
                body = self.rfile.read(length)
                if len(body) != length:
                    self.send_error(400, 'Incomplete body')
                    return
                headers = {'Content-Type': 'application/json'}
                if backend_api_key:
                    headers['X-API-Key'] = backend_api_key
                request = Request(f'http://127.0.0.1:{port}/api/v1/sync', data=body, headers=headers, method='POST')
                try:
                    response = urlopen(request, timeout=30)
                except HTTPError as error:
                    response = error
                with response:
                    payload = response.read()
                    self.send_response(response.code)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('Content-Length', str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
            except Exception:
                self.send_error(502, 'Local backend unavailable')

        def blocked_write(self):
            self.send_error(403, 'Endpoint not available')

        do_PUT = do_DELETE = do_PATCH = blocked_write

        def log_message(self, *_):
            pass

    return ThreadingHTTPServer(('127.0.0.1', 0), ReadOnly)
