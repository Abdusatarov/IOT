"""Read-only loopback gateway and verified official cloudflared installer."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
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


def gateway(port):
    class ReadOnly(BaseHTTPRequestHandler):
        def do_GET(self):
            path = urlsplit(self.path).path
            allowed = path == '/' or path.startswith('/assets/') or path in (
                '/api/v1/health', '/api/v1/measurements', '/api/v1/calendar',
                '/api/v1/map', '/api/v1/statistics', '/api/v1/recommendations')
            if not allowed or not self.path.startswith('/') or self.path.startswith('//'):
                self.send_error(403, 'Public preview is read-only')
                return
            try:
                with urlopen(f'http://127.0.0.1:{port}' + self.path, timeout=20) as response:
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
            self.send_error(403, 'Public preview is read-only')

        do_PUT = do_DELETE = do_PATCH = do_POST

        def log_message(self, *_):
            pass

    return ThreadingHTTPServer(('127.0.0.1', 0), ReadOnly)
