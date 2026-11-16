#include <Adafruit_NeoPixel.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <cstring>

#define LED_PIN 18
#define LED_COUNT 100
#define KEY_COUNT 61
#define LED_BUDGET_MA 1200  // Budget estimé pour le ruban seul

const bool REVERSE_LED = false;
const char* SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const char* RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

uint8_t notes[20] = {};
uint8_t palette[6] = {170, 114, 255, 255, 101, 166};
bool connected = false;
bool validFrame = false;
bool restartAdvertising = false;
uint32_t lastFrameMs = 0;

class Connexion : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    portENTER_CRITICAL(&mux);
    connected = true;
    validFrame = false;
    restartAdvertising = false;
    portEXIT_CRITICAL(&mux);
  }

  void onDisconnect(BLEServer*) override {
    portENTER_CRITICAL(&mux);
    connected = false;
    validFrame = false;
    restartAdvertising = true;
    portEXIT_CRITICAL(&mux);
  }
};

class Reception : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    auto data = c->getValue();
    const uint8_t* p = reinterpret_cast<const uint8_t*>(data.c_str());
    size_t n = data.length();
    uint32_t now = millis();

    portENTER_CRITICAL(&mux);
    if (connected && n == 7 && p[0] == 2) {
      memcpy(palette, p + 1, 6);
    } else if (connected && n == 20 && p[0] == 1) {
      memcpy(notes, p, 20);
      lastFrameMs = now;
      validFrame = true;
    }
    portEXIT_CRITICAL(&mux);
  }
};

void setup() {
  Serial.begin(115200);
  strip.begin();
  strip.clear();
  strip.show();

  BLEDevice::init("Piano Etoile");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new Connexion());

  BLEService* service = server->createService(SERVICE_UUID);
  BLECharacteristic* rx = service->createCharacteristic(
    RX_UUID,
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_WRITE_NR
  );
  rx->setCallbacks(new Reception());
  service->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("Piano Etoile : Bluetooth pret");
}

void loop() {
  uint8_t frame[20];
  uint8_t colors[6];
  bool active, restart;
  uint32_t last;

  portENTER_CRITICAL(&mux);
  memcpy(frame, notes, 20);
  memcpy(colors, palette, 6);
  active = connected && validFrame;
  last = lastFrameMs;
  restart = restartAdvertising;
  restartAdvertising = false;
  portEXIT_CRITICAL(&mux);

  uint32_t now = millis();
  strip.clear();

  if (active && now - last < 3000) {
    int brightness = min((int)frame[18], 100);
    int phase = (now % 1000) * 200 / 1000;
    int wave = phase <= 100 ? phase : 200 - phase;
    int gain = 100;
    if (frame[19] == 1) gain = 40 + wave * 60 / 100;
    if (frame[19] == 2) gain = 75 + wave * 25 / 100;

    // Estimation du courant : 1 mA/LED au repos, 20 mA/canal.
    uint32_t sum = 0;
    for (int i = 0; i < KEY_COUNT; i++) {
      bool left = frame[2 + i / 8] & (1 << (i % 8));
      bool right = frame[10 + i / 8] & (1 << (i % 8));
      if (left || right) {
        int c = right ? 3 : 0;
        sum += colors[c] + colors[c + 1] + colors[c + 2];
      }
    }
    uint32_t level = brightness * gain;
    uint32_t requested = sum * level / 10000;
    uint32_t budget = (LED_BUDGET_MA - LED_COUNT) * 255UL / 20;
    if (requested > budget) level = level * budget / requested;

    for (int i = 0; i < KEY_COUNT; i++) {
      bool left = frame[2 + i / 8] & (1 << (i % 8));
      bool right = frame[10 + i / 8] & (1 << (i % 8));
      if (!left && !right) continue;

      int c = right ? 3 : 0;
      int led = REVERSE_LED ? KEY_COUNT - 1 - i : i;
      strip.setPixelColor(led,
        colors[c] * level / 10000,
        colors[c + 1] * level / 10000,
        colors[c + 2] * level / 10000);
    }
  }

  strip.show();

  if (restart) BLEDevice::startAdvertising();
  delay(30);
}
