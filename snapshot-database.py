"""Create the portable SQLite database distributed with this project."""
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parent
source = root / 'air-quality-backend' / 'air_quality.db'
target = root / 'data' / 'air_quality.db'
target.parent.mkdir(exist_ok=True)
if not source.is_file():
    raise SystemExit('Local database not found: ' + str(source))
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as database:
    with sqlite3.connect(target) as snapshot:
        database.backup(snapshot)
        if snapshot.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise SystemExit('Database integrity check failed')
        count = snapshot.execute('SELECT count(*) FROM measurements').fetchone()[0]
print(f'Database snapshot saved with {count} measurements: {target}')
