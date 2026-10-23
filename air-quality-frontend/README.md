# Air Quality Monitor — проект для передачи backend-разработчику

Цепочка: ESP32 → BLE → Android (GPS + локальная БД) → **Backend** → веб-карта.

Android и frontend готовы. Нужен backend. Всё, что он должен реализовать, описано в `docs/API_CONTRACT.md`.

## Состав
- `docs/API_CONTRACT.md` — контракт API, модель данных, AQI, требования
- `docs/sample_sync_request.json` — пример запроса от Android
- `docs/sample_measurements_response.json` — пример ответа для карты
- `frontend/map-leaflet.html` — карта на Leaflet (OSM)
- `frontend/map-2gis.html` — карта на 2GIS MapGL (нужен ключ в `CFG.KEY`)

## Как проверить frontend с backend
1. Запустить backend с включённым CORS.
2. В frontend-файле в `CFG.API_BASE` указать адрес backend.
3. Открыть файл через `http://localhost` (не через file://).
Если backend недоступен, frontend показывает демо-данные (в углу «Демо-данные»).
