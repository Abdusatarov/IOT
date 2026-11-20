#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <DHT.h>

// =====================================================
// ПИНЫ ESP32-C3 SUPERMINI
// =====================================================

#define DHT_PIN   3
#define MQ135_PIN 0

// Сохранён тип из твоего старого рабочего кода.
#define DHT_TYPE DHT22

// Встроенный синий LED распространённой ESP32-C3 SuperMini.
// LOW — включён, HIGH — выключен.
#define LED_PIN 8

// =====================================================
// ИНДИКАЦИЯ
// =====================================================

#define LED_DISCONNECTED_INTERVAL 1000
#define LED_CONNECTED_INTERVAL    500
#define LED_TRANSMIT_TIME         100

unsigned long lastLedChange = 0;
unsigned long transmitLedOffTime = 0;

bool ledState = false;
bool transmitting = false;

// =====================================================
// ДАТЧИК
// =====================================================

DHT dht(DHT_PIN, DHT_TYPE);

// Empty = stable unique ID derived from this ESP32 chip.
// To preserve the first sensor history only, override its ID with "ESP32-001".
// Never use the same override on two different boards.
const char DEVICE_ID_OVERRIDE[] = "";
String deviceId;

String makeDeviceId() {
  if (strlen(DEVICE_ID_OVERRIDE) > 0) return String(DEVICE_ID_OVERRIDE);
  const uint64_t chip = ESP.getEfuseMac();
  char id[24];
  snprintf(id, sizeof(id), "ESP32-%04X%08X",
           (unsigned int)((chip >> 32) & 0xFFFF),
           (unsigned int)(chip & 0xFFFFFFFF));
  return String(id);
}


// =====================================================
// BLUETOOTH — КАК В СТАРОМ КОДЕ
// =====================================================

#define SERVICE_UUID \
  "4fafc201-1fb5-459e-8fcc-c5c9c331914b"

#define CHARACTERISTIC_UUID \
  "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLECharacteristic *pCharacteristic = nullptr;

bool deviceConnected = false;

// =====================================================
// СВЕТОДИОД
// =====================================================

void ledOn() {
  digitalWrite(LED_PIN, LOW);
  ledState = true;
}

void ledOff() {
  digitalWrite(LED_PIN, HIGH);
  ledState = false;
}

void updateLed() {
  unsigned long now = millis();

  // Короткая вспышка при отправке.
  if (transmitting) {
    if (now >= transmitLedOffTime) {
      transmitting = false;
      ledOff();
    }

    return;
  }

  // Без подключения — медленное мигание.
  if (!deviceConnected) {
    if (now - lastLedChange >= LED_DISCONNECTED_INTERVAL) {
      lastLedChange = now;

      if (ledState) {
        ledOff();
      } else {
        ledOn();
      }
    }

    return;
  }

  // С подключением — быстрое мигание.
  if (now - lastLedChange >= LED_CONNECTED_INTERVAL) {
    lastLedChange = now;

    if (ledState) {
      ledOff();
    } else {
      ledOn();
    }
  }
}

void showTransmission() {
  ledOn();

  transmitting = true;
  transmitLedOffTime = millis() + LED_TRANSMIT_TIME;
}

// =====================================================
// СОБЫТИЯ BLUETOOTH
// =====================================================

class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override {
    deviceConnected = true;

    Serial.println();
    Serial.println("================================");
    Serial.println("BLE CLIENT CONNECTED");
    Serial.println("================================");

    ledOff();
    lastLedChange = millis();
  }

  void onDisconnect(BLEServer *pServer) override {
    deviceConnected = false;

    Serial.println();
    Serial.println("BLE CLIENT DISCONNECTED");

    ledOff();

    delay(100);
    BLEDevice::startAdvertising();

    Serial.println("BLE advertising restarted");
  }
};

// =====================================================
// ЗАПУСК
// =====================================================

void setup() {
  Serial.begin(115200);
  deviceId = makeDeviceId();
  delay(1000);
  Serial.print("Device ID: ");
  Serial.println(deviceId);

  // Светодиод.
  pinMode(LED_PIN, OUTPUT);
  ledOff();

  Serial.println();
  Serial.println("================================");
  Serial.println("AIR QUALITY ESP32-C3");
  Serial.println("================================");

  // Температура и влажность.
  dht.begin();
  Serial.println("DHT sensor initialized");

  // Аналоговый вход MQ-135.
  analogReadResolution(12);
  analogSetPinAttenuation(MQ135_PIN, ADC_11db);

  Serial.println("MQ-135 initialized");

  // Bluetooth.
  BLEDevice::init("ESP32-AIR-QUALITY");

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService =
    pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_NOTIFY
  );

  pCharacteristic->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising *pAdvertising =
    BLEDevice::getAdvertising();

  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);

  BLEDevice::startAdvertising();

  Serial.println();
  Serial.println("BLE ready");
  Serial.println("Device name: ESP32-AIR-QUALITY");
  Serial.println("Waiting for Android...");

  lastLedChange = millis();
}

// =====================================================
// ОСНОВНОЙ ЦИКЛ
// =====================================================

void loop() {
  updateLed();

  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  int mq135Raw = analogRead(MQ135_PIN);

  Serial.println();
  Serial.println("--------------------------------");

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("DHT: ERROR");
  } else {
    Serial.print("Temperature: ");
    Serial.print(temperature, 1);
    Serial.println(" C");

    Serial.print("Humidity: ");
    Serial.print(humidity, 1);
    Serial.println(" %");
  }

  Serial.print("MQ-135 RAW: ");
  Serial.println(mq135Raw);

  // Формат JSON сохранён из старого кода.
  String json = "{";

  json += "\"device_id\":\"";
  json += deviceId;
  json += "\",";

  if (isnan(temperature)) {
    json += "\"temperature\":null,";
  } else {
    json += "\"temperature\":";
    json += String(temperature, 1);
    json += ",";
  }

  if (isnan(humidity)) {
    json += "\"humidity\":null,";
  } else {
    json += "\"humidity\":";
    json += String(humidity, 1);
    json += ",";
  }

  json += "\"mq135_raw\":";
  json += String(mq135Raw);
  json += "}";

  Serial.print("JSON: ");
  Serial.println(json);

  // Отправка одним уведомлением, как в старом коде.
  if (deviceConnected) {
    pCharacteristic->setValue(json.c_str());
    pCharacteristic->notify();

    Serial.println("BLE: DATA SENT");
    showTransmission();
  } else {
    Serial.println("BLE: waiting for Android");
  }

  // Пауза с работающей индикацией.
  unsigned long startTime = millis();

  while (millis() - startTime < 2000) {
    updateLed();
    delay(10);
  }
}