# API-контракт backend

Базовый путь: `/api/v1`. Формат: JSON, время в ISO 8601 UTC.
Нужен **CORS**, чтобы веб-карта могла делать запросы.

## 1. GET /api/v1/health
Ответ `200`: `{ "status": "ok" }`

## 2. POST /api/v1/sync  (Android → backend)
Тело: `{ "measurements": [ ... ] }` (пример: `sample_sync_request.json`).

Поля записи:
| поле | тип | обяз. | примечание |
|---|---|---|---|
| measurement_id | string (UUID) | да | ключ идемпотентности |
| device_id | string | да | например `ESP32-001` |
| temperature_c | number | да | диапазон −40…80 |
| humidity_pct | number | да | 0…100 |
| mq135_raw | integer | да | сырой ADC ESP32 (0…4095); сейчас = 0, сенсор не подключён |
| latitude / longitude | number | да | −90…90 / −180…180 |
| gps_accuracy_m | number | нет | метры |
| measured_at | string | да | ISO 8601 UTC |
| altitude_m | number\|null | нет | на будущее, сейчас Android не шлёт |
| synced | boolean | нет | поле клиента, сервером игнорируется |

Ответ `200`:
```json
{ "accepted": 1, "duplicates": 0, "rejected": 0, "errors": [] }
```
`errors` — по каждой отклонённой записи: `{ "measurement_id": "...", "field": "latitude", "message": "..." }`.

Правила:
- **Идемпотентность:** повторная отправка того же `measurement_id` не создаёт дубликат и считается в `duplicates`. Весь запрос не падает из-за одной плохой записи (частичный успех).
- Неизвестные поля не должны ломать запрос (хранить в `extra`/игнорировать), чтобы можно было добавлять новые сенсоры.
- Пустой/слишком большой массив → `400`/`413` (лимит, например, 1000 записей).

## 3. GET /api/v1/measurements  (backend → карта)
Параметры (все необязательные): `from`, `to` (ISO 8601), `device_id`, `category`, `bbox=minLon,minLat,maxLon,maxLat`, `limit` (по умолч. 1000), `cursor`.
Ответ: `{ "items": [ ... ] }` — пример `sample_measurements_response.json`.
Каждый элемент = сырые данные + блок `air_quality`.

## 4. Модель данных (разделять слои!)
1. **raw_measurements** — исходные данные от устройства, **не изменять и не удалять**: measurement_id (PK/unique), device_id, temperature_c, humidity_pct, mq135_raw, latitude, longitude, gps_accuracy_m, altitude_m (nullable), measured_at, received_at, extra (JSON).
2. **processed_measurements** — рассчитанные сервером показатели: measurement_id (FK), algorithm_version, rs_ohm, rs_r0, ppm по газам (если есть калибровка), temperature/humidity-компенсация, created_at.
3. **air_quality** — итог: measurement_id (FK), algorithm_version, aqi (nullable), category, created_at.
4. **recommendations** — текст рекомендации по category (справочник/шаблоны), язык.
Дополнительно: **calibrations** (device_id, sensor, r0, параметры кривой, valid_from) — для расчёта ppm.

Требования:
- Алгоритм подключаемый: смена алгоритма/калибровки **не меняет API**; можно пересчитать `processed`/`air_quality` по сохранённым raw.
- Не делать условие «если MQ-135 не подключён, обработка не нужна». Архитектура готова принимать реальные значения сразу.
- Если расчёт невозможен (например, `mq135_raw = 0` или нет калибровки): `aqi = null`, `category = "unknown"`. Это не «хорошо».
- Новые сенсоры/показатели добавляются без смены существующей схемы (generic-таблица значений или JSON `extra`).

## 5. Категории AQI (клиент ожидает эти id)
| category | AQI |
|---|---|
| good | 0–50 |
| moderate | 51–100 |
| usg | 101–150 (вредно для чувствительных) |
| unhealthy | 151–200 |
| very | 201–300 |
| hazardous | 300+ |
| unknown | AQI не рассчитан |

Пороги должны лежать в конфигурации, а не в коде.

## 6. Рекомендации (шаблоны v1)
- good: Воздух чистый, можно проветривать помещение.
- moderate: Достаточно короткого проветривания; не оставайтесь долго в закрытом помещении.
- usg: Людям с болезнями дыхательных путей лучше надеть маску и снизить активность.
- unhealthy: Сократите время на улице, используйте маску или очиститель воздуха.
- very: Оставайтесь дома, окна закройте, включите очиститель воздуха.
- hazardous: Не выходите на улицу, используйте средства защиты.
- unknown: Оценка качества воздуха недоступна: только температура и влажность.

## 7. Прочее
- Аутентификация: API-ключ в заголовке (например, `X-API-Key`) для `/sync`; чтение для карты можно оставить открытым на этапе разработки.
- Точность GPS сейчас около 100 м (тестовый запуск) — хранить `gps_accuracy_m`, не отбрасывать такие записи.
- Рекомендуемый стек: Python + FastAPI + PostgreSQL (или SQLite для прототипа), тесты pytest, документация OpenAPI.
- Приёмка: повторный `sync` той же записи → `duplicates: 1`; запись с `mq135_raw = 0` → `unknown`; запись с ошибкой в одном поле не блокирует остальные.
