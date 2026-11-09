# Текущий интерфейс

Единственный frontend: `almatyair-frontend` (React + TypeScript + Vite).
Старые папки air-quality-frontend и air-quality-frontend-frozen удалены по просьбе пользователя.
Архивные адреса /web/* удалены и возвращают 404.

В папке almatyair-frontend: `npm ci`, затем `npm run build`.
Backend раздаёт dist на / и assets на /assets. Сборка нужна до запуска backend.
Текущий адрес: http://127.0.0.1:8002/ .

Интерфейс использует /api/v1/measurements и /api/v1/calendar.
MQ-135 показывается в raw, графики и календарь основаны на сохранённых измерениях.
Коричневый слой интерполирует относительный raw, не AQI/ppm.

INTEGRATION.md описывает предыдущий этап и не является инструкцией текущего frontend.
