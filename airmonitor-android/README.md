# AirMonitor Android

Готовый MVP Android-приложения для вашего проекта: ESP32 -> BLE -> Android -> GPS + время -> Room/SQLite -> синхронизация с локальным ПК.

## ESP32 BLE contract
- Name: `ESP32-AIR-QUALITY`
- Service: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- Characteristic: `beb5483e-36e1-4688-b7f5-ea07361b26a8`
- JSON: `{"device_id":"ESP32-001","temperature":24.6,"humidity":48.2,"mq135_raw":1834}`

## Запуск
1. Открой папку в Android Studio.
2. Дай Gradle скачать зависимости.
3. Подключи физический Android-телефон.
4. Разреши Bluetooth и геолокацию.
5. Включи Bluetooth и Location.
6. Запусти приложение.
7. Включи ESP32.
8. Нажми CONNECT ESP32.
9. После появления данных нажми SAVE MEASUREMENT + GPS.

## Синхронизация дома
В `network/ApiClient.kt` замени:
`http://192.168.1.100:8000/`
на IP вашего ПК.

Backend должен принимать `POST /api/v1/sync`.

Важно: MQ-135 сохраняется как raw ADC. Приложение не называет его официальным AQI/ppm.


## Background collection and internet sync (18 November 2026)

Start server with ../air-quality/Script/server-panel.cmd. Its Internet link now accepts authenticated Android ingestion only; it does not expose stored measurements. Copy the HTTPS URL and Android sync key from the panel into the app and SAVE URL.
START BACKGROUND starts a user-visible connectedDevice/location foreground service from the visible Activity. A persistent notification provides Stop. The same process-wide BLE manager and Room database are shared by service/UI. Sensors are saved every 10 seconds, even if the BLE values are identical; UUID and receipt timestamp are assigned once. GPS comes from ongoing FusedLocation updates; stale (>60s) or unavailable fixes remain null.
The service sends pending records approximately every 30 seconds while online; WorkManager provides a connected-network one-time queue and a 15-minute periodic fallback. Failures back off. Backend acknowledgements are matched by both index and measurement_id; rejected rows stay local and do not prevent later pages from syncing. UTC ISO strings and snake_case DTOs are separate from Room models; no database migration/deletion was needed.
START BACKGROUND requires location and BLE runtime permissions; notification permission is requested on Android 13+. Start while the app is visible. No ACCESS_BACKGROUND_LOCATION, boot receiver or forced battery exemption is used. Service uses a partial wake lock until Stop, so continuous collection consumes battery. Force-stop/reboot requires starting collection again. OS/vendor energy restrictions can still defer network work.
MonitoringService.kt owns collection/GPS/wake lock. MonitorRuntime.kt owns shared BLE/Room/flows. network/SyncWorker.kt contains SyncEngine and scheduling. network/ApiService.kt contains wire DTOs and acknowledgement validation. Secret is in private SharedPreferences, app backup disabled, key never appears in diagnostic logs. Public server URLs require HTTPS; private LAN HTTP remains available.
Build/check: gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug. Existing Room schema/migration 1->2 remains unchanged. Never use destructive migration.


## QR и язык (20.11.2026)

Верхняя кнопка English/Русский меняет язык с сохранением в ui_prefs; по умолчанию русский. UiLanguage.wrap применяет локаль Activity, статические строки — res/values и values-ru, BLE/service status-коды переводятся только при отображении. Не переводить JSON-поля/статусы ack в wire-протоколе. Фоновый сбор и Room не менялись.

«Сканировать QR сервера» использует встроенный ZXing, камера запрашивается при сканировании. Личный QR из новой панели содержит JSON type=airmonitor.sync, version=1, server_url, sync_key. После сканирования показан адрес и подтверждение отправки измерений/GPS; только после подтверждения настройки сохраняются и ставится задача sync. Обычный QR сайта отклоняется с пояснением. Ключ не показывается, toString редактирован, QR-изображения не сохраняются сканером. URL/key сохраняются одним prefs edit и читаются ApiClient из одного snapshot, без смешения при смене сервера.

SyncQrConfigTest проверяет JSON/HTTPS/локальный HTTP/неправильные QR/скрытие ключа и декодирует bitmap реального Python QR с исключительно фиктивным тестовым ключом. Это проверка формата и декодера, не доказательство физического сканирования камерой. Физическое сканирование ещё проверить с QR на экране ноутбука.

Новая сборка установлена через adb install --no-streaming -r на SM-A525F и SM-J330F. Запуск и русские подписи проверены, данные приложения не очищались. Каждая ESP32 подключается к своему телефону; сервер различает их по firmware device_id. Исходная ESP32-001 не менялась, прошивка второй платы с уникальным чиповым ID лежит в ../air-quality/Script/firmware. Не подменять device_id случайным именем телефона.
