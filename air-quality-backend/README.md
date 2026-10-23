# Air Quality IoT Backend

Рабочий REST backend для ESP32 → BLE → Android/Room → HTTP → БД → веб-карта.
Python 3.12, FastAPI, SQLAlchemy, Alembic; PostgreSQL для развёртывания, SQLite для локального запуска и тестов.

## Быстрый запуск без Docker

Из корня распакованного проекта:

```bash
python -m venv .venv
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
# Для точного воспроизведения проверенной среды: pip install -r requirements-lock.txt
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env
alembic upgrade head
python -m app
```

SQLite-файл создаётся миграцией. Swagger: http://localhost:8000/docs, ReDoc: http://localhost:8000/redoc,
OpenAPI: http://localhost:8000/openapi.json.

```bash
curl http://localhost:8000/api/v1/health
curl -X POST http://localhost:8000/api/v1/sync \
  -H 'Content-Type: application/json' --data-binary @examples/sync.json
curl 'http://localhost:8000/api/v1/map?from=2026-09-30T00:00:00Z&to=2026-10-01T00:00:00Z'
```

Health: `{"status":"ok"}`. Health проверяет соединение с БД; при недоступности — 503.
Наличие применённых миграций обеспечивает процедура развёртывания.

## PostgreSQL через Docker Compose

1. Скопировать `.env.example` в `.env`.
2. Заменить `POSTGRES_PASSWORD` собственным паролем (для URL избегать неэкранированных `@:/?#%`).
3. Выполнить:

```bash
docker compose up --build -d
docker compose logs -f api
```

Compose создаёт БД, ждёт её готовности, выполняет отдельный migration job и запускает API на порту 8000.
Данные хранятся в именованном Docker volume; порт БД наружу не публикуется.
Для обновления схемы: `docker compose run --rm migrate`.
Миграции выполняйте одним процессом до запуска новых экземпляров API.

Для существующего PostgreSQL создайте роль/БД через администратора, например:

```sql
CREATE ROLE air_quality LOGIN;
-- Установите пароль интерактивно в psql: \password air_quality
CREATE DATABASE air_quality OWNER air_quality;
```

Укажите `DATABASE_URL=postgresql+psycopg://air_quality:YOUR_URL_ENCODED_PASSWORD@localhost:5432/air_quality`
и выполните `alembic upgrade head`. Пароли с особыми символами должны быть URL-encoded.
В Compose DATABASE_URL формируется из POSTGRES_*; значение DATABASE_URL из .env используется при локальном запуске.

## Конфигурация

| Переменная | Назначение / значение по умолчанию |
|---|---|
| DATABASE_URL | `sqlite:///./air_quality.db`; PostgreSQL URL для развёртывания |
| HOST | `0.0.0.0` |
| PORT | `8000` |
| API_KEY | Пусто: без авторизации; задано: заголовок `X-API-Key` обязателен на всех data endpoints |
| CORS_ORIGINS | JSON-массив origin, по умолчанию `[]` |
| POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD | Конфигурация Compose; пароль обязателен |
| TEST_DATABASE_URL | Только pytest; отдельная одноразовая тестовая БД |

`.env` исключён из Git и Docker image. SECRET_KEY не требуется: backend не подписывает токены.
Авторизация выделена в dependency; её можно заменить на JWT и права доступа к отдельным устройствам.
Health и документация доступны без API_KEY. Перед публичным развёртыванием задайте API_KEY и HTTPS
на reverse proxy, лимит тела запроса и rate limiting. Общий API key — базовый режим, не multi-tenant IAM.
На HTTPS-сайте API также должен быть HTTPS. CORS задаётся явным списком.

## API

| Метод | Путь | Поведение |
|---|---|---|
| GET | /api/v1/health | Проверка доступности API и БД |
| POST | /api/v1/sync | Batch 1–1000 измерений, частичное принятие |
| POST | /api/v1/import | Тот же объект batch либо корневой JSON-массив |
| GET | /api/v1/measurements | Список, total, limit, offset |
| GET | /api/v1/measurements/latest | Одно новейшее по measured_at измерение; 404 при отсутствии |
| GET | /api/v1/measurements/{measurement_id} | Полная raw-запись и отдельный объект processed |
| GET | /api/v1/map | Только записи с latitude И longitude |
| GET | /api/v1/statistics | count/min/max/avg по raw-полям, NULL не участвует |
| GET | /api/v1/recommendations | Явный статус not_calibrated, пустой список рекомендаций |

Фильтры списка, latest, карты и статистики: `device_id`, `from`, `to`, `max_accuracy_m`.
Временные границы включительные, ISO-8601 с timezone; `from <= to`.
`max_accuracy_m` исключает также неизвестную accuracy (NULL), поскольку точность этих точек нельзя подтвердить.
Без фильтра сохраняются и возвращаются любые допустимые accuracy.
Пагинация списка/карты: `limit` 1–1000, `offset >= 0`.
Сортировка `measured_at DESC, id DESC`. Offset-пагинация не является snapshot: при новых вставках
между запросами для стабильного выгружания фиксируйте временной диапазон и выполняйте дедупликацию по UUID.
`latest` означает последнее глобально или для указанного device_id, не список последних по всем устройствам.

## Полный sync request

```json
{
  "measurements": [
    {
      "measurement_id": "6571e9b2-c23d-40fb-a79e-6f813d24a8d9",
      "device_id": "ESP32-001",
      "temperature_c": 24.6,
      "humidity_pct": 36.5,
      "mq135_raw": 0,
      "latitude": 43.2146908,
      "longitude": 76.851523,
      "altitude_m": 512.3,
      "gps_accuracy_m": 10.2,
      "measured_at": "2026-09-30T15:38:54.183Z",
      "synced": false
    }
  ]
}
```

Первый ответ HTTP 200:

```json
{
  "accepted": 1,
  "duplicates": 0,
  "rejected": 0,
  "results": [
    {
      "index": 0,
      "measurement_id": "6571e9b2-c23d-40fb-a79e-6f813d24a8d9",
      "status": "accepted",
      "details": []
    }
  ]
}
```

Повторный запрос: accepted=0, duplicates=1, статус записи `duplicate`.
`results` всегда соответствует исходному порядку; index начинается с нуля.
При latitude=91 запись получает status=rejected и details:

```json
[{"field":"latitude","message":"Input should be less than or equal to 90","type":"less_than_equal"}]
```

Невалидные записи не останавливают другие. Даже batch, где все записи отклонены, получает HTTP 200
с rejected/results: контейнер запроса обработан. Ошибка структуры контейнера — 422,
синтаксически повреждённый JSON — 400. Повторный UUID с изменёнными значениями не перезаписывает raw:
первая успешно сохранённая запись является исходной. Для исправленного измерения используйте новый UUID.
Валидация выполняется до определения дубликата; невалидный повтор также возвращает rejected.

Android должен помечать Room.synced=true только для accepted/duplicate из results.
Поле synced в БД сохраняет присланный флаг, а не факт серверного подтверждения. Оно не используется
для определения дубликата. HTTP 200 сам по себе НЕ означает, что весь batch принят.
При таймауте/500 можно безопасно повторить весь batch. Не отправляйте NaN/Infinity.

## Карта

Пример содержимого ответа (поля total/limit/offset обеспечивают пагинацию):

```json
{
  "points": [
    {
      "measurement_id": "6571e9b2-c23d-40fb-a79e-6f813d24a8d9",
      "device_id": "ESP32-001",
      "latitude": 43.2146908,
      "longitude": 76.851523,
      "altitude_m": 512.3,
      "gps_accuracy_m": 10.2,
      "temperature_c": 24.6,
      "humidity_pct": 36.5,
      "mq135_raw": 0,
      "air_quality_index": null,
      "measured_at": "2026-09-30T15:38:54.183000Z"
    }
  ],
  "total": 1,
  "limit": 1000,
  "offset": 0
}
```

Координаты являются GPS-точками измерений, не геокодированными адресами или координатами устройства по умолчанию.
Одна отсутствующая координата не мешает сохранению raw, но такая запись не попадает на карту.
Высота не используется вместо координат и не изменяется на основе карты.

## Структура БД

### measurements

| Поле | PostgreSQL | NULL |
|---|---|---|
| id | INTEGER, PK | нет |
| measurement_id | UUID, UNIQUE | нет |
| device_id | VARCHAR(255), index | нет |
| temperature_c, humidity_pct | DOUBLE PRECISION | да |
| mq135_raw | BIGINT | да |
| latitude, longitude | DOUBLE PRECISION | да |
| altitude_m, gps_accuracy_m | DOUBLE PRECISION | да |
| measured_at | TIMESTAMP WITH TIME ZONE, index | нет |
| synced | BOOLEAN | нет |
| created_at | TIMESTAMP WITH TIME ZONE | нет |

Индексы: UNIQUE(measurement_id), device_id, measured_at, (device_id, measured_at), (latitude, longitude).
Ограничения БД: допустимые широта/долгота, gps_accuracy_m >= 0.
Высота сохраняется как double без round; `null`, `0` и `512.3` различаются.
DOUBLE PRECISION сохраняет точность входного IEEE-754 double, а не бесконечную десятичную точность.
MQ-135 — signed 64-bit integer без ADC-ограничения 0–4095: ограничен только типом БД.
Входной ID — UUID, не произвольный текст `ABC`; одинаковые UUID в разных текстовых регистрах нормализуются.

### processed_measurements

Отдельная таблица 1:1; measurement_id — UUID PK/FK → measurements.measurement_id, ON DELETE CASCADE.
Поля: status (index), algorithm_version, air_quality_index, pollution_level,
co_ppm, nh3_ppm, no2_ppm, extra_metrics (JSON), error_code, processed_at (UTC).
NULL у рассчитанных значений означает «не рассчитано», а не чистый воздух.

Raw и pending-строка сохраняются одной транзакцией. `INSERT ... ON CONFLICT DO NOTHING RETURNING`
вместе с UNIQUE обеспечивает атомарную дедупликацию даже при конкурентных запросах.
Batch обрабатывается в стабильном порядке UUID, чтобы снизить риск взаимных блокировок.
Затем SensorProcessor работает в отдельных транзакциях: исключение даёт failed,
недоступность БД оставляет pending; уже зафиксированные raw-данные сохраняются.
При сбое до raw commit транзакция откатывается и клиент получает ошибку.

Для PostGIS можно добавить geography(Point,4326) и GiST-индекс миграцией, строя точки
как ST_MakePoint(longitude, latitude), без изменения Android API. Текущий B-tree не заменяет spatial index.

## Processing и расширение

`app/processing.py`: SensorProcessor возвращает CalculatedMetrics.
Текущий алгоритм `uncalibrated-v1` честно возвращает `not_calibrated`, все концентрации и AQI — NULL.
ADC MQ-135 без калибровки и дополнительных данных не позволяет достоверно восстановить
AQI и отдельные концентрации CO/NH3/NO2. Нулевое raw сохраняется как ноль.

Добавьте калибровку/стандарт AQI в собственную реализацию SensorProcessor, измените algorithm_version;
поля raw и sync API останутся прежними. Дополнительные метрики можно хранить в extra_metrics.
Обработка сейчас синхронная после raw commit; тяжёлую обработку можно вынести в worker,
используя durable pending-строки. Внешний broker/worker пока не включён.

```bash
python -m scripts.reprocess         # pending/failed
python -m scripts.reprocess --all   # пересчитать после изменения алгоритма
```

Запускайте один reprocess-процесс за раз. Скрипт обновляет текущий результат, не хранит историю
всех алгоритмов. Для аудита нескольких версий добавьте таблицу истории отдельной миграцией.
Состояние результата нужно проверять после выполнения; вывод attempted — число попыток, не гарантия успеха.

## Время, валидация, ошибки

measured_at обязателен, ISO-8601 строка с `T` и timezone Z/offset. Epoch-числа и naive timestamps отклоняются.
Сохранение/выдача в UTC; PostgreSQL TIMESTAMPTZ хранит момент времени, а SQL-клиент может отображать его
в timezone своей сессии. created_at и processed_at устанавливает сервер в UTC.
Допустимы nullable sensor/GPS поля; пропущенные nullable поля получают NULL, пропущенный synced — false.
Числовые строки и boolean вместо чисел не принимаются; целые JSON-числа допустимы для double.
Температура/влажность без искусственных диапазонов, только конечные числа.
Неизвестные ключи измерения отклоняются, чтобы опечатка altitude не привела к тихой потере данных.

Структура ошибок: `{"error":"validation_error","details":[...]}`.
HTTP 400 — JSON syntax; 422 — форма запроса/фильтра; 401 — ключ; 404 — запись/маршрут;
500 — внутренняя ошибка; 503 — health не смог обратиться к БД.
Stack traces идут в серверный лог, не клиенту. Частичные отказы записей описаны выше.

## JSON import и Android

`POST /api/v1/import` принимает JSON body с Content-Type application/json: либо объект
`{"measurements":[...]}`, либо корневой массив `[...]`. Не multipart-файл.
Экспорт с другим wrapper/метаданными сначала приведите к одному из этих двух форматов.
Старый exported synced=true тоже принимается; повторные UUID не создают новые записи.

```bash
curl -X POST http://localhost:8000/api/v1/import \
  -H 'Content-Type: application/json' --data-binary @examples/sync.json
```

Для эмулятора Android адрес компьютера обычно `http://10.0.2.2:8000`;
для физического телефона — LAN IP компьютера и доступный порт в firewall.
`localhost` на телефоне указывает на сам телефон. Для релиза используйте HTTPS;
локальный HTTP требует разрешения cleartext в debug-конфигурации Android.
Room/BLE-код не входит в этот backend-проект.

## Тесты и миграции

```bash
pytest -q
alembic upgrade head
alembic check
alembic downgrade base    # УДАЛЯЕТ таблицы; только одноразовая тестовая БД
alembic upgrade head
```

Для проверки PostgreSQL:

```bash
TEST_DATABASE_URL='postgresql+psycopg://USER:PASSWORD@localhost:5432/air_quality_test' pytest -q
```

TEST_DATABASE_URL должен вести в отдельную тестовую БД: fixture удаляет содержимое таблиц перед каждым тестом.
Не указывайте рабочую БД. CI `.github/workflows/tests.yml` содержит SQLite и PostgreSQL 17 jobs.
Результаты реально выполненных проверок и ограничения среды приведены в TEST_RESULTS.md.

## Файлы проекта

Полный перечень созданных файлов — FILES.txt. Основные каталоги:

- app/: API, конфигурация, ORM, валидация, sync service, SensorProcessor.
- alembic/: версия схемы и runner миграций.
- tests/: API/БД/конкурентность/processing tests.
- examples/: полный sync JSON, реальные примеры ответов, снимок OpenAPI.
- scripts/: повторная обработка сохранённых измерений.
- .github/workflows/: отдельные jobs SQLite/PostgreSQL.
- Dockerfile, compose.yaml, .env.example: конфигурация запуска.

Проект создан с нуля; существующие пользовательские файлы не изменялись.

## Основания реализации

Официальная документация: [SQLAlchemy PostgreSQL ON CONFLICT](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html),
[FastAPI error handling](https://fastapi.tiangolo.com/tutorial/handling-errors/).
