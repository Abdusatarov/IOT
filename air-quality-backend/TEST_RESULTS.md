# Результаты проверки

Дата: 2026-10-02. Python 3.12. Проверки выполнены локально, без внешнего ESP32/Android.

## Автоматические тесты

`python -m pytest -q`: **53 passed, 1 warning in 1.89s**.

Проверены:
- health и single/multi-record sync;
- дубликат в одном batch и повторный HTTP-запрос, raw не перезаписывается;
- 4 одновременные отправки одного UUID: accepted=1, duplicates=3, строк в БД=1;
- пересекающиеся конкурентные batch с обратным порядком UUID;
- latitude/longitude вне диапазона, required fields, пустой device_id;
- timestamp: invalid/epoch/без timezone отклоняются, +05:00 нормализуется к UTC;
- altitude: NULL, 512.3, 0, отрицательная высота, дробная точность;
- MQ-135: 0, 1834, NULL, отрицательное и большое integer-значение;
- неверные типы, Infinity, отрицательная accuracy;
- partial success, malformed JSON, невалидный envelope, batch limit;
- карта: GPS-only, точность, диапазон времени, пагинация;
- latest, device filter, 404, statistics с NULL;
- JSON import в обоих форматах;
- processing exception сохраняет raw; повторная обработка восстанавливает статус;
- необязательный API key, OpenAPI, структурированный 500 без секретных деталей.

Warning: Starlette предупреждает об устаревающем httpx-адаптере TestClient.
Это предупреждение тестовой зависимости; все проверки завершились успешно.

## Миграции

На SQLite успешно выполнены upgrade → check → downgrade → upgrade.
`alembic check`: No new upgrade operations detected.
PostgreSQL DDL успешно сгенерирован командой `alembic upgrade head --sql`,
сохранён в examples/postgresql-schema.sql. Это проверка генерации SQL, НЕ проверка выполнения на PostgreSQL.

## HTTP smoke check

Отдельный Uvicorn-процесс и настоящие HTTP-запросы на loopback:
health → sync accepted=1 → повтор sync duplicates=1 → map altitude_m=512.3.
Результат: PASSED. Использована отдельная SQLite БД, созданная миграцией.

## Ограничения проверки

PostgreSQL server и Docker в среде не запускались. Попытка установить PostgreSQL
была ограничена правами среды. Нельзя считать PostgreSQL-интеграцию или Compose проверенными здесь.
Добавлен CI job с PostgreSQL 17; его надо запустить после загрузки проекта в GitHub.
Калибровочные расчёты AQI/ppm намеренно не реализованы: алгоритм возвращает not_calibrated.
Сервер на внешнем хостинге не развёрнут, Android/ESP32 end-to-end проверка не выполнялась.
