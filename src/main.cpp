#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <FastLED.h>
#include <ctype.h>
#include <string.h>
#include <string>

// Hardware defaults for a common flexible 8x32 WS2812B/NeoPixel matrix.
// The panel is treated as a 32x8 landscape display by rotating coordinates.
// Confirm these on the actual panel before raising brightness.
constexpr uint8_t kDataPin = 5;
constexpr uint8_t kPanelColumns = 8;
constexpr uint8_t kPanelRows = 32;
constexpr uint16_t kNumLeds = kPanelColumns * kPanelRows;
constexpr uint8_t kDefaultBrightness = 8;
constexpr uint16_t kMilliampLimit = 300;
constexpr char kBleDeviceName[] = "LED-Matrix";
constexpr char kBleServiceUuid[] = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
constexpr char kBleRxUuid[] = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";
constexpr char kBleTxUuid[] = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";

enum class DisplayRotation : uint8_t {
  None,
  Clockwise,
  CounterClockwise,
  UpsideDown,
};

enum class EffectMode : uint8_t {
  Scroll,
  Flash,
  Center,
  Bounce,
  RainbowText,
  RainbowLoop,
  RainbowGlow,
  Rainbow,
  Scanner,
  Sparkle,
  Comet,
  Blank,
};

enum class TextColorFx : uint8_t {
  Solid,
  RainbowStatic,
  RainbowCycle,
};

// Mapping knobs. Adjust these after running the startup corner test. The
// physical panel settings describe the LED path before display rotation.
constexpr DisplayRotation kDisplayRotation = DisplayRotation::Clockwise;
constexpr bool kPanelSerpentineRows = true;
constexpr bool kPanelReverseColumns = false;
constexpr bool kPanelReverseRows = true;

constexpr bool kRotated90 =
    kDisplayRotation == DisplayRotation::Clockwise ||
    kDisplayRotation == DisplayRotation::CounterClockwise;
constexpr uint8_t kMatrixWidth = kRotated90 ? kPanelRows : kPanelColumns;
constexpr uint8_t kMatrixHeight = kRotated90 ? kPanelColumns : kPanelRows;

constexpr uint16_t kFrameMs = 45;
constexpr uint16_t kStartupTestMs = 2500;
constexpr CRGB kDefaultTextColor = CRGB(255, 70, 20);
constexpr CRGB kDefaultBackgroundColor = CRGB::Black;
constexpr char kDefaultMessage[] = "THANK YOU";
constexpr uint8_t kMaxMessageChars = 80;
constexpr uint8_t kMaxBleCommandChars = 120;
constexpr uint8_t kFlashCharsPerPage = 5;
constexpr uint8_t kFlashFramesOn = 8;
constexpr uint8_t kFlashFramesOff = 8;

CRGB leds[kNumLeds];
BLECharacteristic *txCharacteristic = nullptr;

char message[kMaxMessageChars + 1] = {};
char pendingBleCommand[kMaxBleCommandChars + 1] = {};
uint8_t brightness = kDefaultBrightness;
uint16_t frameMs = kFrameMs;
CRGB textColor = kDefaultTextColor;
CRGB backgroundColor = kDefaultBackgroundColor;
bool messageChanged = false;
bool effectChanged = false;
EffectMode effectMode = EffectMode::Scroll;
TextColorFx textColorFx = TextColorFx::Solid;
bool bleClientConnected = false;
volatile bool bleAdvertisingRestartNeeded = false;
volatile uint32_t bleAdvertisingRestartMs = 0;
bool pendingBleCommandAvailable = false;
portMUX_TYPE bleCommandMux = portMUX_INITIALIZER_UNLOCKED;

struct Glyph {
  char c;
  uint8_t col[5];
};

// 5x7 uppercase font. Each byte is one column, least significant bit at top.
const Glyph kFont[] PROGMEM = {
    {' ', {0x00, 0x00, 0x00, 0x00, 0x00}},
    {'!', {0x00, 0x00, 0x5F, 0x00, 0x00}},
    {'-', {0x00, 0x08, 0x08, 0x08, 0x00}},
    {'.', {0x00, 0x60, 0x60, 0x00, 0x00}},
    {'0', {0x3E, 0x51, 0x49, 0x45, 0x3E}},
    {'1', {0x00, 0x42, 0x7F, 0x40, 0x00}},
    {'2', {0x42, 0x61, 0x51, 0x49, 0x46}},
    {'3', {0x21, 0x41, 0x45, 0x4B, 0x31}},
    {'4', {0x18, 0x14, 0x12, 0x7F, 0x10}},
    {'5', {0x27, 0x45, 0x45, 0x45, 0x39}},
    {'6', {0x3C, 0x4A, 0x49, 0x49, 0x30}},
    {'7', {0x01, 0x71, 0x09, 0x05, 0x03}},
    {'8', {0x36, 0x49, 0x49, 0x49, 0x36}},
    {'9', {0x06, 0x49, 0x49, 0x29, 0x1E}},
    {':', {0x00, 0x36, 0x36, 0x00, 0x00}},
    {'?', {0x02, 0x01, 0x51, 0x09, 0x06}},
    {'A', {0x7E, 0x11, 0x11, 0x11, 0x7E}},
    {'B', {0x7F, 0x49, 0x49, 0x49, 0x36}},
    {'C', {0x3E, 0x41, 0x41, 0x41, 0x22}},
    {'D', {0x7F, 0x41, 0x41, 0x22, 0x1C}},
    {'E', {0x7F, 0x49, 0x49, 0x49, 0x41}},
    {'F', {0x7F, 0x09, 0x09, 0x09, 0x01}},
    {'G', {0x3E, 0x41, 0x49, 0x49, 0x7A}},
    {'H', {0x7F, 0x08, 0x08, 0x08, 0x7F}},
    {'I', {0x00, 0x41, 0x7F, 0x41, 0x00}},
    {'J', {0x20, 0x40, 0x41, 0x3F, 0x01}},
    {'K', {0x7F, 0x08, 0x14, 0x22, 0x41}},
    {'L', {0x7F, 0x40, 0x40, 0x40, 0x40}},
    {'M', {0x7F, 0x02, 0x0C, 0x02, 0x7F}},
    {'N', {0x7F, 0x04, 0x08, 0x10, 0x7F}},
    {'O', {0x3E, 0x41, 0x41, 0x41, 0x3E}},
    {'P', {0x7F, 0x09, 0x09, 0x09, 0x06}},
    {'Q', {0x3E, 0x41, 0x51, 0x21, 0x5E}},
    {'R', {0x7F, 0x09, 0x19, 0x29, 0x46}},
    {'S', {0x46, 0x49, 0x49, 0x49, 0x31}},
    {'T', {0x01, 0x01, 0x7F, 0x01, 0x01}},
    {'U', {0x3F, 0x40, 0x40, 0x40, 0x3F}},
    {'V', {0x1F, 0x20, 0x40, 0x20, 0x1F}},
    {'W', {0x3F, 0x40, 0x38, 0x40, 0x3F}},
    {'X', {0x63, 0x14, 0x08, 0x14, 0x63}},
    {'Y', {0x07, 0x08, 0x70, 0x08, 0x07}},
    {'Z', {0x61, 0x51, 0x49, 0x45, 0x43}},
};

void logicalToPanel(uint8_t x, uint8_t y, uint8_t &column, uint8_t &row) {
  switch (kDisplayRotation) {
    case DisplayRotation::None:
      column = x;
      row = y;
      break;
    case DisplayRotation::Clockwise:
      column = y;
      row = kPanelRows - 1 - x;
      break;
    case DisplayRotation::CounterClockwise:
      column = kPanelColumns - 1 - y;
      row = x;
      break;
    case DisplayRotation::UpsideDown:
      column = kPanelColumns - 1 - x;
      row = kPanelRows - 1 - y;
      break;
  }

  if (kPanelReverseColumns) {
    column = kPanelColumns - 1 - column;
  }
  if (kPanelReverseRows) {
    row = kPanelRows - 1 - row;
  }
}

uint16_t xy(uint8_t x, uint8_t y) {
  if (x >= kMatrixWidth || y >= kMatrixHeight) {
    return 0;
  }

  uint8_t panelColumn = 0;
  uint8_t panelRow = 0;
  logicalToPanel(x, y, panelColumn, panelRow);

  if (kPanelSerpentineRows && (panelRow & 0x01)) {
    panelColumn = kPanelColumns - 1 - panelColumn;
  }

  return static_cast<uint16_t>(panelRow) * kPanelColumns + panelColumn;
}

void drawPixelSafe(int16_t x, int16_t y, const CRGB &color) {
  if (x < 0 || y < 0 || x >= kMatrixWidth || y >= kMatrixHeight) {
    return;
  }

  leds[xy(static_cast<uint8_t>(x), static_cast<uint8_t>(y))] = color;
}

bool glyphColumns(char c, uint8_t columns[5]) {
  c = static_cast<char>(toupper(static_cast<unsigned char>(c)));
  for (const Glyph &glyph : kFont) {
    char glyphChar = pgm_read_byte(&glyph.c);
    if (glyphChar == c) {
      for (uint8_t i = 0; i < 5; i++) {
        columns[i] = pgm_read_byte(&glyph.col[i]);
      }
      return true;
    }
  }

  return false;
}

void drawChar(int16_t x, int16_t y, char c, const CRGB &color) {
  uint8_t columns[5];
  if (!glyphColumns(c, columns)) {
    glyphColumns('?', columns);
  }

  for (uint8_t col = 0; col < 5; col++) {
    for (uint8_t row = 0; row < 7; row++) {
      if (columns[col] & (1 << row)) {
        drawPixelSafe(x + col, y + row, color);
      }
    }
  }
}

uint16_t messageWidth(const char *message) {
  const size_t len = strlen(message);
  if (len == 0) {
    return 0;
  }

  return static_cast<uint16_t>((len * 6) - 1);
}

void drawMessage(int16_t x, const char *message, const CRGB &color) {
  constexpr int16_t y = (kMatrixHeight > 7) ? ((kMatrixHeight - 7) / 2) : 0;

  for (size_t i = 0; message[i] != '\0'; i++) {
    drawChar(x + static_cast<int16_t>(i * 6), y, message[i], color);
  }
}

void drawCenteredMessage(const char *message, const CRGB &color) {
  const int16_t startX =
      (static_cast<int16_t>(kMatrixWidth) -
       static_cast<int16_t>(messageWidth(message))) /
      2;
  drawMessage(startX, message, color);
}

uint8_t flashPageCount(const char *message) {
  uint8_t pages = 0;

  for (size_t i = 0; message[i] != '\0';) {
    while (message[i] == ' ') {
      i++;
    }

    size_t wordLength = 0;
    while (message[i + wordLength] != '\0' &&
           message[i + wordLength] != ' ') {
      wordLength++;
    }

    if (wordLength > 0) {
      pages += static_cast<uint8_t>(
          (wordLength + kFlashCharsPerPage - 1) / kFlashCharsPerPage);
    }

    i += wordLength;
  }

  return pages > 0 ? pages : 1;
}

void flashPageAt(const char *message, uint8_t targetPage, char output[6]) {
  uint8_t page = 0;

  for (size_t i = 0; message[i] != '\0';) {
    while (message[i] == ' ') {
      i++;
    }

    size_t wordLength = 0;
    while (message[i + wordLength] != '\0' &&
           message[i + wordLength] != ' ') {
      wordLength++;
    }

    for (size_t offset = 0; offset < wordLength;
         offset += kFlashCharsPerPage) {
      const size_t chunkLength =
          min(static_cast<size_t>(kFlashCharsPerPage), wordLength - offset);
      if (page == targetPage) {
        memcpy(output, message + i + offset, chunkLength);
        output[chunkLength] = '\0';
        return;
      }
      page++;
    }

    i += wordLength;
  }

  output[0] = ' ';
  output[1] = '\0';
}

void drawFlashMessage(uint16_t frame, const CRGB &color) {
  constexpr uint8_t kFlashCycleFrames = kFlashFramesOn + kFlashFramesOff;
  const uint8_t page =
      (frame / kFlashCycleFrames) % flashPageCount(message);

  if (frame % kFlashCycleFrames >= kFlashFramesOn) {
    return;
  }

  char pageText[kFlashCharsPerPage + 1] = {};
  flashPageAt(message, page, pageText);
  drawCenteredMessage(pageText, color);
}

const __FlashStringHelper *textColorFxName(TextColorFx fx) {
  switch (fx) {
    case TextColorFx::RainbowStatic:
      return F("RAINBOW_STATIC");
    case TextColorFx::RainbowCycle:
      return F("RAINBOW_CYCLE");
    case TextColorFx::Solid:
    default:
      return F("STATIC");
  }
}

void addPixelSafe(int16_t x, int16_t y, const CRGB &color) {
  if (x < 0 || y < 0 || x >= kMatrixWidth || y >= kMatrixHeight) {
    return;
  }

  leds[xy(static_cast<uint8_t>(x), static_cast<uint8_t>(y))] += color;
}

void drawBouncingMessage(uint16_t frame, const CRGB &color) {
  const int16_t width = static_cast<int16_t>(messageWidth(message));
  const int16_t minX = min<int16_t>(0, kMatrixWidth - width);
  const int16_t maxX = max<int16_t>(0, kMatrixWidth - width);
  const int16_t span = maxX - minX;

  if (span <= 0) {
    drawMessage(minX, message, color);
    return;
  }

  const int16_t cycle = span * 2;
  const int16_t phase = static_cast<int16_t>(frame % cycle);
  const int16_t position = phase <= span ? phase : cycle - phase;
  drawMessage(minX + position, message, color);
}

void drawRainbowMessage(int16_t startX, const char *text, uint16_t frame,
                        bool loopHue, bool cycleBrightness,
                        bool aura) {
  constexpr int16_t yStart = (kMatrixHeight > 7) ? ((kMatrixHeight - 7) / 2) : 0;

  for (size_t i = 0; text[i] != '\0'; i++) {
    uint8_t columns[5];
    if (!glyphColumns(text[i], columns)) {
      glyphColumns('?', columns);
    }

    for (uint8_t col = 0; col < 5; col++) {
      for (uint8_t row = 0; row < 7; row++) {
        if ((columns[col] & (1 << row)) == 0) {
          continue;
        }

        const int16_t x = startX + static_cast<int16_t>(i * 6) + col;
        const int16_t y = yStart + row;
        if (x < 0 || y < 0 || x >= kMatrixWidth || y >= kMatrixHeight) {
          continue;
        }

        uint8_t hue = static_cast<uint8_t>(x * 14 + y * 28);
        if (loopHue) {
          hue = static_cast<uint8_t>(hue + frame * 9);
        }

        uint8_t value = 255;
        if (cycleBrightness) {
          value = static_cast<uint8_t>(170 + (sin8(static_cast<uint8_t>(frame * 6 + x * 10)) / 3));
        }

        const CRGB center = CHSV(hue, 255, value);
        drawPixelSafe(x, y, center);

        if (aura) {
          CRGB near = center;
          near.nscale8(56);
          CRGB far = center;
          far.nscale8(24);

          for (int8_t dx = -1; dx <= 1; dx++) {
            for (int8_t dy = -1; dy <= 1; dy++) {
              if (dx == 0 && dy == 0) {
                continue;
              }
              addPixelSafe(x + dx, y + dy, near);
            }
          }

          addPixelSafe(x - 2, y, far);
          addPixelSafe(x + 2, y, far);
          addPixelSafe(x, y - 2, far);
          addPixelSafe(x, y + 2, far);
        }
      }
    }
  }
}

void drawTextWithColorFx(int16_t startX, const char *text, uint16_t frame,
                         TextColorFx fx = textColorFx) {
  switch (fx) {
    case TextColorFx::RainbowStatic:
      drawRainbowMessage(startX, text, frame, false, false, false);
      break;
    case TextColorFx::RainbowCycle:
      drawRainbowMessage(startX, text, frame, true, true, false);
      break;
    case TextColorFx::Solid:
    default:
      drawMessage(startX, text, textColor);
      break;
  }
}

void drawCenteredTextWithColorFx(const char *text, uint16_t frame,
                                 TextColorFx fx = textColorFx) {
  const int16_t startX =
      (static_cast<int16_t>(kMatrixWidth) -
       static_cast<int16_t>(messageWidth(text))) /
      2;
  drawTextWithColorFx(startX, text, frame, fx);
}

void drawFlashMessageWithColorFx(uint16_t frame,
                                 TextColorFx fx = textColorFx) {
  constexpr uint8_t kFlashCycleFrames = kFlashFramesOn + kFlashFramesOff;
  const uint8_t page =
      (frame / kFlashCycleFrames) % flashPageCount(message);

  if (frame % kFlashCycleFrames >= kFlashFramesOn) {
    return;
  }

  char pageText[kFlashCharsPerPage + 1] = {};
  flashPageAt(message, page, pageText);
  drawCenteredTextWithColorFx(pageText, frame, fx);
}

int16_t bouncingStartX(uint16_t frame, const char *text) {
  const int16_t width = static_cast<int16_t>(messageWidth(text));
  const int16_t minX = min<int16_t>(0, kMatrixWidth - width);
  const int16_t maxX = max<int16_t>(0, kMatrixWidth - width);
  const int16_t span = maxX - minX;

  if (span <= 0) {
    return minX;
  }

  const int16_t cycle = span * 2;
  const int16_t phase = static_cast<int16_t>(frame % cycle);
  const int16_t position = phase <= span ? phase : cycle - phase;
  return minX + position;
}

void drawRainbowEffect(uint16_t frame) {
  for (uint8_t y = 0; y < kMatrixHeight; y++) {
    for (uint8_t x = 0; x < kMatrixWidth; x++) {
      const uint8_t hue = static_cast<uint8_t>(frame * 8 + x * 8 + y * 24);
      drawPixelSafe(x, y, CHSV(hue, 255, 255));
    }
  }
}

void drawScannerEffect(uint16_t frame) {
  const uint8_t period = (kMatrixWidth - 1) * 2;
  const uint8_t phase = frame % period;
  const uint8_t head = phase < kMatrixWidth ? phase : period - phase;

  for (uint8_t x = 0; x < kMatrixWidth; x++) {
    const int distance =
        abs(static_cast<int>(x) - static_cast<int>(head));
    if (distance > 3) {
      continue;
    }

    const uint8_t value = 255 - static_cast<uint8_t>(distance * 64);
    for (uint8_t y = 0; y < kMatrixHeight; y++) {
      drawPixelSafe(x, y, CRGB(value, value / 8, 0));
    }
  }
}

void drawSparkleEffect() {
  for (uint8_t y = 0; y < kMatrixHeight; y++) {
    for (uint8_t x = 0; x < kMatrixWidth; x++) {
      if (random8() < 24) {
        drawPixelSafe(x, y, CHSV(random8(), 220, 255));
      }
    }
  }
}

void drawCometEffect(uint16_t frame) {
  constexpr uint8_t tailLength = 10;
  const uint8_t head = frame % (kMatrixWidth + tailLength);

  for (uint8_t tail = 0; tail < tailLength; tail++) {
    const int16_t x = static_cast<int16_t>(head) - tail;
    if (x < 0 || x >= kMatrixWidth) {
      continue;
    }

    const uint8_t value = 255 - tail * 22;
    for (uint8_t y = 0; y < kMatrixHeight; y++) {
      const uint8_t centerDistance = abs(static_cast<int>(y) - 3);
      const uint8_t centerBoost =
          centerDistance > 3
              ? 0
              : static_cast<uint8_t>((3 - centerDistance) * 8);
      drawPixelSafe(x, y, CRGB(0, value / 2 + centerBoost, value));
    }
  }
}

void drawFrame(EffectMode mode, int16_t scrollX, uint16_t frame) {
  if (mode == EffectMode::Blank) {
    fill_solid(leds, kNumLeds, CRGB::Black);
    return;
  }

  fill_solid(leds, kNumLeds, backgroundColor);

  switch (mode) {
    case EffectMode::Flash:
      drawFlashMessageWithColorFx(frame);
      break;
    case EffectMode::Center:
      drawCenteredTextWithColorFx(message, frame);
      break;
    case EffectMode::Bounce:
      drawTextWithColorFx(bouncingStartX(frame, message), message, frame);
      break;
    case EffectMode::RainbowText:
      drawTextWithColorFx(scrollX, message, frame, TextColorFx::RainbowStatic);
      break;
    case EffectMode::RainbowLoop:
      drawTextWithColorFx(scrollX, message, frame, TextColorFx::RainbowCycle);
      break;
    case EffectMode::RainbowGlow:
      drawTextWithColorFx(scrollX, message, frame, TextColorFx::RainbowCycle);
      break;
    case EffectMode::Rainbow:
      drawRainbowEffect(frame);
      break;
    case EffectMode::Scanner:
      drawScannerEffect(frame);
      break;
    case EffectMode::Sparkle:
      drawSparkleEffect();
      break;
    case EffectMode::Comet:
      drawCometEffect(frame);
      break;
    case EffectMode::Scroll:
    default:
      drawTextWithColorFx(scrollX, message, frame);
      break;
  }
}

void showStartupTest() {
  fill_solid(leds, kNumLeds, CRGB::Black);

  drawPixelSafe(0, 0, CRGB::Red);
  drawPixelSafe(kMatrixWidth - 1, 0, CRGB::Green);
  drawPixelSafe(0, kMatrixHeight - 1, CRGB::Blue);
  drawPixelSafe(kMatrixWidth - 1, kMatrixHeight - 1, CRGB::White);

  for (uint8_t x = 1; x < kMatrixWidth - 1; x++) {
    drawPixelSafe(x, 0, CRGB(16, 0, 0));
    drawPixelSafe(x, kMatrixHeight - 1, CRGB(16, 16, 16));
  }
  for (uint8_t y = 1; y < kMatrixHeight - 1; y++) {
    drawPixelSafe(0, y, CRGB(0, 0, 16));
    drawPixelSafe(kMatrixWidth - 1, y, CRGB(0, 16, 0));
  }

  FastLED.show();
  delay(kStartupTestMs);
}

uint16_t boundedIntValue(const String &value, uint16_t fallback,
                         uint16_t minValue, uint16_t maxValue) {
  if (value.length() == 0) {
    return fallback;
  }

  const long parsed = value.toInt();
  if (parsed < minValue) {
    return minValue;
  }
  if (parsed > maxValue) {
    return maxValue;
  }

  return static_cast<uint16_t>(parsed);
}

int8_t hexNibble(char c) {
  if (c >= '0' && c <= '9') {
    return c - '0';
  }
  if (c >= 'A' && c <= 'F') {
    return c - 'A' + 10;
  }
  if (c >= 'a' && c <= 'f') {
    return c - 'a' + 10;
  }

  return -1;
}

bool parseHexColor(String value, CRGB &color) {
  value.trim();
  if (value.startsWith("#")) {
    value.remove(0, 1);
  }

  if (value.length() != 6) {
    return false;
  }

  uint8_t channels[3] = {};
  for (uint8_t channel = 0; channel < 3; channel++) {
    const int8_t high = hexNibble(value.charAt(channel * 2));
    const int8_t low = hexNibble(value.charAt(channel * 2 + 1));
    if (high < 0 || low < 0) {
      return false;
    }
    channels[channel] = static_cast<uint8_t>((high << 4) | low);
  }

  color = CRGB(channels[0], channels[1], channels[2]);
  return true;
}

String colorHex(const CRGB &color) {
  char buffer[8] = {};
  snprintf(
      buffer, sizeof(buffer), "#%02X%02X%02X", color.r, color.g, color.b);
  return String(buffer);
}

void setMessage(const String &input) {
  size_t writeIndex = 0;
  for (size_t i = 0; i < input.length() && writeIndex < kMaxMessageChars;
       i++) {
    const char c = input.charAt(i);
    if (c >= 32 && c <= 126) {
      message[writeIndex++] =
          static_cast<char>(toupper(static_cast<unsigned char>(c)));
    }
  }

  if (writeIndex == 0) {
    strncpy(message, kDefaultMessage, sizeof(message));
  } else {
    message[writeIndex] = '\0';
  }

  messageChanged = true;
}

void setEffectMode(EffectMode mode) {
  if (effectMode == mode) {
    return;
  }

  effectMode = mode;
  effectChanged = true;
}

bool isTextEffect(EffectMode mode) {
  return mode == EffectMode::Scroll || mode == EffectMode::Flash ||
         mode == EffectMode::Center || mode == EffectMode::Bounce ||
         mode == EffectMode::RainbowText ||
         mode == EffectMode::RainbowLoop ||
         mode == EffectMode::RainbowGlow;
}

const __FlashStringHelper *effectModeName(EffectMode mode);

const __FlashStringHelper *modeName() {
  if (isTextEffect(effectMode)) {
    return F("TEXT");
  }

  return effectModeName(effectMode);
}

const __FlashStringHelper *textMovementName() {
  switch (effectMode) {
    case EffectMode::Flash:
      return F("FLASH");
    case EffectMode::Center:
      return F("CENTER");
    case EffectMode::Bounce:
      return F("BOUNCE");
    case EffectMode::Scroll:
    default:
      return F("SCROLL");
  }
}

bool setTextMovementFromValue(String value) {
  value.trim();
  value.toUpperCase();

  if (value == F("SCROLL") || value == F("TEXT") || value == F("MESSAGE")) {
    setEffectMode(EffectMode::Scroll);
    return true;
  }
  if (value == F("FLASH") || value == F("BLINK")) {
    setEffectMode(EffectMode::Flash);
    return true;
  }
  if (value == F("CENTER") || value == F("STATIC") || value == F("HOLD")) {
    setEffectMode(EffectMode::Center);
    return true;
  }
  if (value == F("BOUNCE") || value == F("PINGPONG") ||
      value == F("PING-PONG")) {
    setEffectMode(EffectMode::Bounce);
    return true;
  }

  return false;
}

bool setTextColorFxFromValue(String value) {
  value.trim();
  value.toUpperCase();

  if (value == F("STATIC") || value == F("SOLID") ||
      value == F("NONE") || value == F("COLOR")) {
    textColorFx = TextColorFx::Solid;
    effectChanged = true;
    return true;
  }
  if (value == F("RAINBOW_STATIC") || value == F("RAINBOW_TEXT") ||
      value == F("TEXT_RAINBOW") || value == F("TRAINBOW")) {
    textColorFx = TextColorFx::RainbowStatic;
    effectChanged = true;
    return true;
  }
  if (value == F("RAINBOW_CYCLE") || value == F("TEXT_RAINBOW_GLOW") ||
      value == F("GLOW_RAINBOW") || value == F("RAINBOW_GLOW") ||
      value == F("RAINBOW_LOOP") || value == F("TEXT_RAINBOW_LOOP") ||
      value == F("LOOP_RAINBOW") || value == F("RAINBOW_GLOW_AURA") ||
      value == F("RAINBOW_AURA") || value == F("AURA_GLOW")) {
    textColorFx = TextColorFx::RainbowCycle;
    effectChanged = true;
    return true;
  }

  return false;
}

const __FlashStringHelper *effectModeName(EffectMode mode) {
  switch (mode) {
    case EffectMode::Flash:
      return F("FLASH");
    case EffectMode::Center:
      return F("CENTER");
    case EffectMode::Bounce:
      return F("BOUNCE");
    case EffectMode::RainbowText:
      return F("RAINBOW_TEXT");
    case EffectMode::RainbowLoop:
      return F("RAINBOW_LOOP");
    case EffectMode::RainbowGlow:
      return F("RAINBOW_GLOW");
    case EffectMode::Rainbow:
      return F("RAINBOW");
    case EffectMode::Scanner:
      return F("SCANNER");
    case EffectMode::Sparkle:
      return F("SPARKLE");
    case EffectMode::Comet:
      return F("COMET");
    case EffectMode::Blank:
      return F("BLANK");
    case EffectMode::Scroll:
    default:
      return F("SCROLL");
  }
}

bool setEffectFromValue(String value) {
  value.trim();
  value.toUpperCase();

  if (setTextMovementFromValue(value)) {
    return true;
  }
  if (setTextColorFxFromValue(value)) {
    if (!isTextEffect(effectMode)) {
      setEffectMode(EffectMode::Scroll);
    }
    return true;
  }
  if (value == F("TEXT")) {
    if (!isTextEffect(effectMode)) {
      setEffectMode(EffectMode::Scroll);
    }
    return true;
  }
  if (value == F("RAINBOW") || value == F("RAIN")) {
    setEffectMode(EffectMode::Rainbow);
    return true;
  }
  if (value == F("SCANNER") || value == F("SCAN")) {
    setEffectMode(EffectMode::Scanner);
    return true;
  }
  if (value == F("SPARKLE") || value == F("SPARKLES") ||
      value == F("CONFETTI")) {
    setEffectMode(EffectMode::Sparkle);
    return true;
  }
  if (value == F("COMET")) {
    setEffectMode(EffectMode::Comet);
    return true;
  }
  if (value == F("BLANK") || value == F("OFF") || value == F("BLACK")) {
    setEffectMode(EffectMode::Blank);
    return true;
  }

  return false;
}

void sendBleLine(const String &line) {
  if (!txCharacteristic || !bleClientConnected) {
    return;
  }

  txCharacteristic->setValue(line.c_str());
  txCharacteristic->notify();
}

String statusLine() {
  String status = F("STATUS MSG=\"");
  status += message;
  status += F("\" BRI=");
  status += String(brightness);
  status += F(" SPEED=");
  status += String(frameMs);
  status += F(" MODE=");
  status += modeName();
  status += F(" TMOVE=");
  status += textMovementName();
  status += F(" TCLR=");
  status += textColorFxName(textColorFx);
  status += F(" FX=");
  status += effectModeName(effectMode);
  status += F(" FG=");
  status += colorHex(textColor);
  status += F(" BG=");
  status += colorHex(backgroundColor);
  status += F("\n");
  return status;
}

void handleControlCommand(String command) {
  command.trim();
  if (command.length() == 0) {
    return;
  }

  String upper = command;
  upper.toUpperCase();

  if (upper == F("HELP")) {
    sendBleLine(
        F("COMMANDS: MSG=TEXT, MODE=TEXT|RAINBOW|SCANNER|SPARKLE|COMET|BLANK, "
          "TMOVE=SCROLL|FLASH|CENTER|BOUNCE, "
          "TCLR=STATIC|RAINBOW_STATIC|RAINBOW_CYCLE, "
          "FX=... (legacy), FG=#RRGGBB, BG=#RRGGBB, BRI=1-128, SPEED=20-160, "
          "STATUS\n"));
    return;
  }

  if (upper == F("STATUS")) {
    sendBleLine(statusLine());
    return;
  }

  int separator = command.indexOf('=');
  if (separator < 0) {
    separator = command.indexOf(':');
  }

  if (separator < 0) {
    setMessage(command);
    if (!isTextEffect(effectMode)) {
      setEffectMode(EffectMode::Scroll);
    }
    sendBleLine(statusLine());
    return;
  }

  String key = upper.substring(0, separator);
  String value = command.substring(separator + 1);
  key.trim();
  value.trim();

  if (key == F("MSG") || key == F("MESSAGE") || key == F("TEXT")) {
    setMessage(value);
    if (!isTextEffect(effectMode)) {
      setEffectMode(EffectMode::Scroll);
    }
    sendBleLine(statusLine());
    return;
  }

  if (key == F("FX") || key == F("EFFECT")) {
    if (setEffectFromValue(value)) {
      sendBleLine(statusLine());
    } else {
      sendBleLine(F("ERR UNKNOWN EFFECT. SEND HELP\n"));
    }
    return;
  }

  if (key == F("TMOVE") || key == F("MOVE") || key == F("MOTION")) {
    if (setTextMovementFromValue(value)) {
      if (!isTextEffect(effectMode)) {
        setEffectMode(EffectMode::Scroll);
      }
      sendBleLine(statusLine());
    } else {
      sendBleLine(F("ERR UNKNOWN TEXT MOVEMENT. SEND HELP\n"));
    }
    return;
  }

  if (key == F("TCLR") || key == F("TCFX") || key == F("TEXTFX") ||
      key == F("TEXTCOLORFX")) {
    if (setTextColorFxFromValue(value)) {
      if (!isTextEffect(effectMode)) {
        setEffectMode(EffectMode::Scroll);
      }
      sendBleLine(statusLine());
    } else {
      sendBleLine(F("ERR UNKNOWN TEXT COLOR FX. SEND HELP\n"));
    }
    return;
  }

  if (key == F("MODE")) {
    String modeValue = value;
    modeValue.toUpperCase();
    if (modeValue == F("TEXT")) {
      if (!isTextEffect(effectMode)) {
        setEffectMode(EffectMode::Scroll);
      }
      sendBleLine(statusLine());
      return;
    }

    if (setEffectFromValue(modeValue)) {
      sendBleLine(statusLine());
    } else {
      sendBleLine(F("ERR UNKNOWN MODE. SEND HELP\n"));
    }
    return;
  }

  if (key == F("FG") || key == F("COLOR") || key == F("TEXTCOLOR") ||
      key == F("TCOLOR")) {
    if (parseHexColor(value, textColor)) {
      effectChanged = true;
      sendBleLine(statusLine());
    } else {
      sendBleLine(F("ERR COLOR MUST BE #RRGGBB\n"));
    }
    return;
  }

  if (key == F("BG") || key == F("BGCOLOR") || key == F("BACKGROUND")) {
    if (parseHexColor(value, backgroundColor)) {
      effectChanged = true;
      sendBleLine(statusLine());
    } else {
      sendBleLine(F("ERR COLOR MUST BE #RRGGBB\n"));
    }
    return;
  }

  if (key == F("BRI") || key == F("B") || key == F("BRIGHTNESS")) {
    brightness =
        static_cast<uint8_t>(boundedIntValue(value, brightness, 1, 128));
    FastLED.setBrightness(brightness);
    sendBleLine(statusLine());
    return;
  }

  if (key == F("SPEED") || key == F("FRAME") || key == F("MS") ||
      key == F("SCROLL")) {
    frameMs = boundedIntValue(value, frameMs, 20, 160);
    sendBleLine(statusLine());
    return;
  }

  sendBleLine(F("ERR UNKNOWN COMMAND. SEND HELP\n"));
}

void queueBleCommand(const std::string &value) {
  portENTER_CRITICAL(&bleCommandMux);
  const size_t len = min(value.length(), static_cast<size_t>(kMaxBleCommandChars));
  memcpy(pendingBleCommand, value.data(), len);
  pendingBleCommand[len] = '\0';
  pendingBleCommandAvailable = true;
  portEXIT_CRITICAL(&bleCommandMux);
}

void handlePendingBleCommand() {
  if (!pendingBleCommandAvailable) {
    return;
  }

  char localCommand[kMaxBleCommandChars + 1] = {};
  portENTER_CRITICAL(&bleCommandMux);
  strncpy(localCommand, pendingBleCommand, sizeof(localCommand) - 1);
  pendingBleCommandAvailable = false;
  portEXIT_CRITICAL(&bleCommandMux);

  handleControlCommand(String(localCommand));
}

class MatrixServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    (void)server;
    bleClientConnected = true;
  }

  void onDisconnect(BLEServer *server) override {
    (void)server;
    bleClientConnected = false;
    bleAdvertisingRestartNeeded = true;
    bleAdvertisingRestartMs = millis() + 250;
  }
};

class MatrixRxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    const std::string value = characteristic->getValue();
    if (!value.empty()) {
      queueBleCommand(value);
    }
  }
};

void startBleControl() {
  BLEDevice::init(kBleDeviceName);

  BLEServer *bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new MatrixServerCallbacks());

  BLEService *bleService = bleServer->createService(kBleServiceUuid);
  txCharacteristic = bleService->createCharacteristic(
      kBleTxUuid, BLECharacteristic::PROPERTY_NOTIFY);
  txCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *rxCharacteristic = bleService->createCharacteristic(
      kBleRxUuid, BLECharacteristic::PROPERTY_WRITE |
                      BLECharacteristic::PROPERTY_WRITE_NR);
  rxCharacteristic->setCallbacks(new MatrixRxCallbacks());

  bleService->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(kBleServiceUuid);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.print(F("BLE control advertising as "));
  Serial.println(kBleDeviceName);
}

void handleBleAdvertisingRestart() {
  if (!bleAdvertisingRestartNeeded ||
      static_cast<int32_t>(millis() - bleAdvertisingRestartMs) < 0) {
    return;
  }

  bleAdvertisingRestartNeeded = false;
  BLEDevice::startAdvertising();
}

void setup() {
  Serial.begin(115200);
  delay(250);
  setMessage(kDefaultMessage);
  messageChanged = false;

  FastLED.addLeds<WS2812B, kDataPin, GRB>(leds, kNumLeds);
  FastLED.setBrightness(brightness);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, kMilliampLimit);
  FastLED.clear(true);

  Serial.println();
  Serial.println(F("LED Matrix firmware starting"));
  Serial.print(F("Matrix: "));
  Serial.print(kMatrixWidth);
  Serial.print(F("x"));
  Serial.print(kMatrixHeight);
  Serial.print(F(" logical, "));
  Serial.print(kPanelColumns);
  Serial.print(F("x"));
  Serial.print(kPanelRows);
  Serial.print(F(" physical"));
  Serial.print(F(", LEDs: "));
  Serial.println(kNumLeds);
  Serial.print(F("Message: "));
  Serial.println(message);

  startBleControl();

  showStartupTest();
}

void loop() {
  handleBleAdvertisingRestart();
  static int16_t scrollX = kMatrixWidth;
  static uint16_t animationFrame = 0;
  static uint32_t lastFrameMs = 0;
  const uint32_t now = millis();

  handlePendingBleCommand();

  if (messageChanged || effectChanged) {
    scrollX = kMatrixWidth;
    animationFrame = 0;
    messageChanged = false;
    effectChanged = false;
  }

  if (now - lastFrameMs < frameMs) {
    return;
  }
  lastFrameMs = now;

  drawFrame(effectMode, scrollX, animationFrame);
  FastLED.show();

  animationFrame++;
  if (effectMode == EffectMode::Scroll) {
    scrollX--;
    if (scrollX < -static_cast<int16_t>(messageWidth(message))) {
      scrollX = kMatrixWidth;
    }
  }
}
