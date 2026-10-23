import os
from uuid import uuid4
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app.db import Base


@pytest.fixture
def app(tmp_path, monkeypatch):
    # TEST_DATABASE_URL must point to a disposable test database: tables are reset.
    url = os.environ.get('TEST_DATABASE_URL', f'sqlite:///{tmp_path}/test.db')
    monkeypatch.setenv('DATABASE_URL', url)
    application = create_app(Settings(database_url=url, api_key=None))
    command.upgrade(Config('alembic.ini'), 'head')
    with application.state.engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    yield application
    application.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


@pytest.fixture
def measurement():
    return {'measurement_id': str(uuid4()), 'device_id': 'ESP32-001',
            'temperature_c': 24.6, 'humidity_pct': 36.5, 'mq135_raw': 0,
            'latitude': 43.2146908, 'longitude': 76.851523, 'altitude_m': 512.3,
            'gps_accuracy_m': 10.2, 'measured_at': '2026-09-30T15:38:54.183Z', 'synced': False}
