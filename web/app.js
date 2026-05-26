const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const DEVICE_NAME_PREFIX = "LED-Matrix";
const RECONNECT_DELAY_MS = 2000;

const MATRIX_WIDTH = 32;
const MATRIX_HEIGHT = 8;
const DEFAULT_SPEED = 45;
const MIN_SPEED = 20;
const MAX_SPEED = 160;
const VISUAL_MODES = new Set([
  "TEXT",
  "RAINBOW",
  "SCANNER",
  "SPARKLE",
  "COMET",
  "BLANK",
]);
const TEXT_MOVEMENTS = new Set(["SCROLL", "FLASH", "CENTER", "BOUNCE"]);
const TEXT_COLOR_FX = new Set([
  "STATIC",
  "RAINBOW_STATIC",
  "RAINBOW_CYCLE",
]);
const TEXT_MOVEMENT_SPEED_DEFAULTS = {
  SCROLL: DEFAULT_SPEED,
  FLASH: DEFAULT_SPEED,
  CENTER: DEFAULT_SPEED,
  BOUNCE: DEFAULT_SPEED,
};
const DEFAULT_TEXT_COLOR = "#ff4614";
const DEFAULT_BG_COLOR = "#000000";
const FLASH_CHARS_PER_PAGE = 5;
const FLASH_FRAMES_ON = 8;
const FLASH_FRAMES_OFF = 8;
const STORAGE_KEY = "led-matrix-settings-v1";

const font = {
  " ": [0x00, 0x00, 0x00, 0x00, 0x00],
  "!": [0x00, 0x00, 0x5f, 0x00, 0x00],
  "-": [0x00, 0x08, 0x08, 0x08, 0x00],
  ".": [0x00, 0x60, 0x60, 0x00, 0x00],
  "0": [0x3e, 0x51, 0x49, 0x45, 0x3e],
  "1": [0x00, 0x42, 0x7f, 0x40, 0x00],
  "2": [0x42, 0x61, 0x51, 0x49, 0x46],
  "3": [0x21, 0x41, 0x45, 0x4b, 0x31],
  "4": [0x18, 0x14, 0x12, 0x7f, 0x10],
  "5": [0x27, 0x45, 0x45, 0x45, 0x39],
  "6": [0x3c, 0x4a, 0x49, 0x49, 0x30],
  "7": [0x01, 0x71, 0x09, 0x05, 0x03],
  "8": [0x36, 0x49, 0x49, 0x49, 0x36],
  "9": [0x06, 0x49, 0x49, 0x29, 0x1e],
  ":": [0x00, 0x36, 0x36, 0x00, 0x00],
  "?": [0x02, 0x01, 0x51, 0x09, 0x06],
  A: [0x7e, 0x11, 0x11, 0x11, 0x7e],
  B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22],
  D: [0x7f, 0x41, 0x41, 0x22, 0x1c],
  E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x09, 0x01],
  G: [0x3e, 0x41, 0x49, 0x49, 0x7a],
  H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0x00, 0x41, 0x7f, 0x41, 0x00],
  J: [0x20, 0x40, 0x41, 0x3f, 0x01],
  K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40],
  M: [0x7f, 0x02, 0x0c, 0x02, 0x7f],
  N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e],
  P: [0x7f, 0x09, 0x09, 0x09, 0x06],
  Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x46, 0x49, 0x49, 0x49, 0x31],
  T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f],
  V: [0x1f, 0x20, 0x40, 0x20, 0x1f],
  W: [0x3f, 0x40, 0x38, 0x40, 0x3f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63],
  Y: [0x07, 0x08, 0x70, 0x08, 0x07],
  Z: [0x61, 0x51, 0x49, 0x45, 0x43],
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const connectButton = document.querySelector("#connectButton");
const disconnectButton = document.querySelector("#disconnectButton");
const statusButton = document.querySelector("#statusButton");
const sendMessageButton = document.querySelector("#sendMessageButton");
const clearLogButton = document.querySelector("#clearLogButton");
const messageInput = document.querySelector("#messageInput");
const brightnessInput = document.querySelector("#brightnessInput");
const speedInput = document.querySelector("#speedInput");
const textColorInput = document.querySelector("#textColorInput");
const bgColorInput = document.querySelector("#bgColorInput");
const brightnessValue = document.querySelector("#brightnessValue");
const speedValue = document.querySelector("#speedValue");
const connection = document.querySelector(".connection");
const connectionLabel = document.querySelector("#connectionLabel");
const logList = document.querySelector("#logList");
const effectButtons = document.querySelectorAll("[data-effect]");
const motionButtons = document.querySelectorAll("[data-motion]");
const textColorFxButtons = document.querySelectorAll("[data-text-colorfx]");
const canvas = document.querySelector("#matrixPreview");
const ctx = canvas.getContext("2d");

let device = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let reconnectTimer = null;
let shouldReconnect = false;
let connectionState = "disconnected";
let pendingCommands = [];
let previewStart = performance.now();
let currentVisualMode = "TEXT";
let currentTextMovement = "SCROLL";
let currentTextColorFx = "STATIC";
let textMovementSpeeds = {
  ...TEXT_MOVEMENT_SPEED_DEFAULTS,
};
let hasStoredSettings = false;
let lastColorSendMs = 0;

function setConnectionState(state) {
  connectionState = state;
  const connected = state === "connected";
  const connecting = state === "connecting";
  const reconnecting = state === "reconnecting";

  connection.classList.toggle("connected", connected);
  connectionLabel.textContent =
    state === "connected"
      ? "Connected"
      : state === "connecting"
        ? "Connecting"
      : state === "reconnecting"
        ? "Reconnecting"
        : "Disconnected";
  connectButton.disabled =
    connected || connecting || reconnecting || !navigator.bluetooth;
  disconnectButton.disabled = !connected && !reconnecting;
  statusButton.disabled = !connected;
  sendMessageButton.disabled = !connected;
}

function logLine(text, type = "info") {
  const item = document.createElement("li");
  item.className = type;
  item.textContent = text;
  logList.append(item);
  logList.scrollTop = logList.scrollHeight;
}

function normalizeMessage(value) {
  return value.replace(/[^\x20-\x7e]/g, "").toUpperCase().slice(0, 80);
}

function normalizeColor(value, fallback = DEFAULT_BG_COLOR) {
  const match = String(value || "").match(/^#?[0-9a-fA-F]{6}$/);
  if (!match) {
    return fallback;
  }

  return `#${String(value).replace("#", "").toLowerCase()}`;
}

function normalizeVisualMode(value) {
  const mode = String(value || "TEXT").toUpperCase();
  return VISUAL_MODES.has(mode) ? mode : "TEXT";
}

function normalizeTextMovement(value) {
  const movement = String(value || "SCROLL").toUpperCase();
  return TEXT_MOVEMENTS.has(movement) ? movement : "SCROLL";
}

function normalizeTextColorFx(value) {
  const fx = String(value || "STATIC").toUpperCase();
  if (fx === "SOLID") {
    return "STATIC";
  }
  if (fx === "RAINBOW" || fx === "RAINBOW_TEXT" || fx === "RAINBOW_STATIC") {
    return "RAINBOW_STATIC";
  }
  if (
    fx === "RAINBOW_LOOP" ||
    fx === "RAINBOW_GLOW" ||
    fx === "RAINBOW_CYCLE" ||
    fx === "RAINBOW_GLOW_AURA"
  ) {
    return "RAINBOW_CYCLE";
  }
  return TEXT_COLOR_FX.has(fx) ? fx : "STATIC";
}

function setCurrentVisualMode(mode) {
  currentVisualMode = normalizeVisualMode(mode);
  effectButtons.forEach((button) => {
    const active = normalizeVisualMode(button.dataset.effect) === currentVisualMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setCurrentTextMovement(movement) {
  currentTextMovement = normalizeTextMovement(movement);
  motionButtons.forEach((button) => {
    const active = normalizeTextMovement(button.dataset.motion) === currentTextMovement;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setCurrentTextColorFx(fx) {
  currentTextColorFx = normalizeTextColorFx(fx);
  textColorFxButtons.forEach((button) => {
    const active = normalizeTextColorFx(button.dataset.textColorfx) === currentTextColorFx;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setMessageEffect() {
  setCurrentVisualMode("TEXT");
}

function refreshControlLabels() {
  brightnessValue.textContent = brightnessInput.value;
  speedValue.textContent = `${speedInput.value} ms`;
}

function normalizeSpeed(value, fallback = DEFAULT_SPEED) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return String(fallback);
  }

  return String(Math.min(MAX_SPEED, Math.max(MIN_SPEED, parsed)));
}

function setTextMovementSpeed(movement, speed) {
  const key = normalizeTextMovement(movement);
  const previous = textMovementSpeeds[key] || DEFAULT_SPEED;
  textMovementSpeeds[key] = normalizeSpeed(speed, Number.parseInt(previous, 10));
}

function getTextMovementSpeed(movement = currentTextMovement) {
  const key = normalizeTextMovement(movement);
  return textMovementSpeeds[key] || String(DEFAULT_SPEED);
}

function syncSpeedInputWithTextMovement(movement = currentTextMovement) {
  speedInput.value = getTextMovementSpeed(movement);
  refreshControlLabels();
}

function getCurrentSettings() {
  return {
    message: normalizeMessage(messageInput.value || ""),
    brightness: String(brightnessInput.value || "8"),
    speed: getTextMovementSpeed(currentTextMovement),
    textMovementSpeeds: {
      ...textMovementSpeeds,
    },
    textColor: normalizeColor(textColorInput.value, DEFAULT_TEXT_COLOR),
    bgColor: normalizeColor(bgColorInput.value, DEFAULT_BG_COLOR),
    visualMode: normalizeVisualMode(currentVisualMode),
    textMovement: normalizeTextMovement(currentTextMovement),
    textColorFx: normalizeTextColorFx(currentTextColorFx),
  };
}

function saveSettingsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getCurrentSettings()));
    hasStoredSettings = true;
  } catch (error) {
    console.debug("Unable to persist settings", error);
  }
}

function applySettings(settings = {}) {
  const legacyFx = String(settings.effect || "").toUpperCase();
  const legacyVisualMode = VISUAL_MODES.has(legacyFx) ? legacyFx : "";
  const legacyMovement = TEXT_MOVEMENTS.has(legacyFx) ? legacyFx : "";
  const legacyColorFx =
    legacyFx && normalizeTextColorFx(legacyFx) !== "STATIC"
      ? normalizeTextColorFx(legacyFx)
      : "";

  const fallbackSpeed = normalizeSpeed(settings.speed, DEFAULT_SPEED);
  const savedMovementSpeeds =
    settings.textMovementSpeeds && typeof settings.textMovementSpeeds === "object"
      ? settings.textMovementSpeeds
      : {};
  textMovementSpeeds = {
    ...TEXT_MOVEMENT_SPEED_DEFAULTS,
  };
  TEXT_MOVEMENTS.forEach((movement) => {
    const candidate = savedMovementSpeeds[movement] ?? fallbackSpeed;
    setTextMovementSpeed(movement, candidate);
  });

  messageInput.value = normalizeMessage(settings.message || messageInput.value);
  brightnessInput.value = String(
    Number.parseInt(settings.brightness, 10) || Number.parseInt(brightnessInput.value, 10),
  );
  textColorInput.value = normalizeColor(settings.textColor, DEFAULT_TEXT_COLOR);
  bgColorInput.value = normalizeColor(settings.bgColor, DEFAULT_BG_COLOR);
  setCurrentVisualMode(settings.visualMode || legacyVisualMode || currentVisualMode);
  setCurrentTextMovement(settings.textMovement || legacyMovement || currentTextMovement);
  setCurrentTextColorFx(settings.textColorFx || legacyColorFx || currentTextColorFx);
  syncSpeedInputWithTextMovement(currentTextMovement);
  previewStart = performance.now();
}

function loadSettingsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    applySettings(parsed);
    hasStoredSettings = true;
  } catch (error) {
    console.debug("Unable to load saved settings", error);
  }
}

function isConnected() {
  return Boolean(rxCharacteristic && device?.gatt.connected);
}

function nowMs() {
  return performance.now();
}

function shouldSendColorUpdate() {
  const current = nowMs();
  if (current - lastColorSendMs < 60) {
    return false;
  }

  lastColorSendMs = current;
  return true;
}

function queueCommand(command) {
  if (!shouldReconnect || !device) {
    logLine("Not connected", "error");
    return false;
  }

  pendingCommands.push(command);
  logLine(`Queued ${command}`, "tx");
  scheduleReconnect();
  return true;
}

async function writeCommand(command, allowQueue = true) {
  if (!isConnected()) {
    if (allowQueue) {
      queueCommand(command);
    } else {
      logLine("Not connected", "error");
    }
    return false;
  }

  try {
    await rxCharacteristic.writeValue(encoder.encode(command));
    logLine(`TX ${command}`, "tx");
    return true;
  } catch (error) {
    rxCharacteristic = null;
    txCharacteristic = null;
    logLine(error.message || String(error), "error");
    if (allowQueue) {
      queueCommand(command);
    }
    return false;
  }
}

function clearReconnectTimer() {
  if (!reconnectTimer) {
    return;
  }

  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function registerDisconnectHandler(selectedDevice) {
  selectedDevice.removeEventListener("gattserverdisconnected", onDisconnected);
  selectedDevice.addEventListener("gattserverdisconnected", onDisconnected);
}

async function connectToDevice(selectedDevice, reconnectAttempt = false) {
  clearReconnectTimer();
  registerDisconnectHandler(selectedDevice);
  device = selectedDevice;
  setConnectionState(reconnectAttempt ? "reconnecting" : "connecting");

  const server = await selectedDevice.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);

  rxCharacteristic = await service.getCharacteristic(RX_UUID);
  txCharacteristic = await service.getCharacteristic(TX_UUID);
  await txCharacteristic.startNotifications();
  txCharacteristic.addEventListener("characteristicvaluechanged", onNotification);

  setConnectionState("connected");
  logLine(`Connected to ${device.name || DEVICE_NAME_PREFIX}`);

  if (pendingCommands.length > 0) {
    const queued = [...pendingCommands];
    pendingCommands = [];
    for (let i = 0; i < queued.length; i += 1) {
      const command = queued[i];
      const ok = await writeCommand(command, false);
      if (!ok) {
        pendingCommands = [...queued.slice(i), ...pendingCommands];
        break;
      }
    }
    return;
  }

  if (hasStoredSettings) {
    await commitCurrentSettings();
  } else {
    await writeCommand("STATUS");
  }
}

function scheduleReconnect() {
  if (!shouldReconnect || !device || reconnectTimer) {
    return;
  }

  setConnectionState("reconnecting");
  logLine(`Reconnecting in ${RECONNECT_DELAY_MS / 1000}s`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!shouldReconnect || !device) {
      return;
    }

    try {
      await connectToDevice(device, true);
    } catch (error) {
      console.debug(error);
      logLine("Reconnect failed; retrying", "error");
      scheduleReconnect();
    }
  }, RECONNECT_DELAY_MS);
}

async function connect() {
  try {
    shouldReconnect = true;
    clearReconnectTimer();

    if (navigator.bluetooth?.getDevices) {
      const knownDevices = await navigator.bluetooth.getDevices();
      const knownDevice = knownDevices.find((item) =>
        String(item.name || "").startsWith(DEVICE_NAME_PREFIX),
      );

      if (knownDevice) {
        try {
          await connectToDevice(knownDevice, true);
          return;
        } catch (error) {
          console.debug("Known-device reconnect failed", error);
          rxCharacteristic = null;
          txCharacteristic = null;
        }
      }
    }

    const selectedDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: DEVICE_NAME_PREFIX }],
      optionalServices: [SERVICE_UUID],
    });

    await connectToDevice(selectedDevice);
  } catch (error) {
    logLine(error.message || String(error), "error");
    rxCharacteristic = null;
    txCharacteristic = null;

    if (device && shouldReconnect) {
      scheduleReconnect();
    } else {
      shouldReconnect = false;
      setConnectionState("disconnected");
    }
  }
}

async function autoConnectOnLoad() {
  if (!navigator.bluetooth?.getDevices) {
    return;
  }

  try {
    shouldReconnect = true;
    clearReconnectTimer();

    const devices = await navigator.bluetooth.getDevices();
    const knownDevice = devices.find((item) =>
      String(item.name || "").startsWith(DEVICE_NAME_PREFIX),
    );

    if (!knownDevice) {
      shouldReconnect = false;
      return;
    }

    await connectToDevice(knownDevice, true);
  } catch (error) {
    shouldReconnect = false;
    rxCharacteristic = null;
    txCharacteristic = null;
    setConnectionState("disconnected");
    logLine("Auto-connect unavailable; use Connect", "error");
    console.debug(error);
  }
}

function disconnect() {
  shouldReconnect = false;
  clearReconnectTimer();
  pendingCommands = [];
  if (device?.gatt.connected) {
    device.gatt.disconnect();
    return;
  }

  onDisconnected();
}

function onDisconnected() {
  rxCharacteristic = null;
  txCharacteristic = null;
  setConnectionState("disconnected");
  logLine("Disconnected");
  scheduleReconnect();
}

function onNotification(event) {
  const text = decoder.decode(event.target.value).trim();
  if (!text) {
    return;
  }

  logLine(`RX ${text}`, "rx");
  applyStatus(text);
}

function statusField(status, key) {
  return new RegExp(`(?:^|\\s)${key}=([^\\s]+)`).exec(status)?.[1] || "";
}

function applyStatus(text) {
  const match = text.match(/^STATUS MSG="([^"]*)"\s+(.+)$/);
  if (!match) {
    return;
  }

  messageInput.value = normalizeMessage(match[1]);
  brightnessInput.value =
    statusField(match[2], "BRI") || brightnessInput.value;
  const reportedSpeed = statusField(match[2], "SPEED");
  textColorInput.value = normalizeColor(
    statusField(match[2], "FG"),
    textColorInput.value,
  );
  bgColorInput.value = normalizeColor(
    statusField(match[2], "BG"),
    bgColorInput.value,
  );
  const mode = statusField(match[2], "MODE");
  const move = statusField(match[2], "TMOVE");
  const colorFx = statusField(match[2], "TCLR");

  if (mode) {
    setCurrentVisualMode(mode);
  }
  if (move) {
    setCurrentTextMovement(move);
  }
  if (colorFx) {
    setCurrentTextColorFx(colorFx);
  }
  if (reportedSpeed) {
    setTextMovementSpeed(currentTextMovement, reportedSpeed);
  }

  const legacyFx = statusField(match[2], "FX");
  if (!mode && legacyFx) {
    if (TEXT_MOVEMENTS.has(legacyFx)) {
      setCurrentVisualMode("TEXT");
      setCurrentTextMovement(legacyFx);
    } else if (normalizeTextColorFx(legacyFx) !== "STATIC") {
      setCurrentVisualMode("TEXT");
      setCurrentTextColorFx(normalizeTextColorFx(legacyFx));
    } else {
      setCurrentVisualMode(legacyFx);
    }
  }
  previewStart = performance.now();
  syncSpeedInputWithTextMovement(currentTextMovement);
  saveSettingsToStorage();
}

async function commitCurrentSettings() {
  const settings = getCurrentSettings();
  const activeSpeed = getTextMovementSpeed(settings.textMovement);
  const commands = [
    `MSG=${settings.message || " "}`,
    `BRI=${settings.brightness}`,
    `SPEED=${activeSpeed}`,
    `FG=${settings.textColor}`,
    `BG=${settings.bgColor}`,
    `TMOVE=${settings.textMovement}`,
    `TCLR=${settings.textColorFx}`,
    `MODE=${settings.visualMode}`,
  ];

  for (const command of commands) {
    const ok = await writeCommand(command);
    if (!ok) {
      continue;
    }
  }
}

function glyphColumns(character) {
  return font[character] || font["?"];
}

function messageWidth(text) {
  return text.length === 0 ? 0 : text.length * 6 - 1;
}

function flashPages(text) {
  const pages = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      const chunks = [];
      for (let i = 0; i < word.length; i += FLASH_CHARS_PER_PAGE) {
        chunks.push(word.slice(i, i + FLASH_CHARS_PER_PAGE));
      }
      return chunks;
    });

  return pages.length > 0 ? pages : [" "];
}

function hexToRgb(color) {
  const hex = normalizeColor(color, DEFAULT_TEXT_COLOR).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function colorWithAlpha(color, alpha = 1) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawPreviewBackground(scale) {
  ctx.fillStyle =
    currentVisualMode === "BLANK"
      ? "#000000"
      : normalizeColor(bgColorInput.value, DEFAULT_BG_COLOR);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= MATRIX_WIDTH; x += 1) {
    ctx.beginPath();
    ctx.moveTo(x * scale, 0);
    ctx.lineTo(x * scale, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= MATRIX_HEIGHT; y += 1) {
    ctx.beginPath();
    ctx.moveTo(0, y * scale);
    ctx.lineTo(canvas.width, y * scale);
    ctx.stroke();
  }
}

function drawLedPixel(x, y, scale, color, glow = 0.8, halo = 0) {
  const inset = Math.max(2, scale * 0.16);

  if (halo > 0) {
    const haloInset = Math.max(0, inset - scale * 0.28);
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = Math.min(0.45, 0.22 + halo * 0.1);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 18 * (1 + halo);
    ctx.fillRect(
      x * scale + haloInset,
      y * scale + haloInset,
      scale - haloInset * 2,
      scale - haloInset * 2,
    );
    ctx.globalAlpha = prevAlpha;
  }

  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 * glow;
  ctx.fillRect(
    x * scale + inset,
    y * scale + inset,
    scale - inset * 2,
    scale - inset * 2,
  );
}

function drawTextAt(text, startX, scale, color) {
  for (let i = 0; i < text.length; i += 1) {
    const charX = startX + i * 6;
    const columns = glyphColumns(text[i]);
    for (let col = 0; col < 5; col += 1) {
      for (let row = 0; row < 7; row += 1) {
        if ((columns[col] & (1 << row)) === 0) {
          continue;
        }

        const x = charX + col;
        const y = row;
        if (x < 0 || x >= MATRIX_WIDTH || y >= MATRIX_HEIGHT) {
          continue;
        }

        drawLedPixel(x, y, scale, color);
      }
    }
  }
}

function drawTextAtWithColorFn(
  text,
  startX,
  scale,
  colorFn,
  glowFn = () => 0.85,
  haloFn = () => 0,
) {
  for (let i = 0; i < text.length; i += 1) {
    const charX = startX + i * 6;
    const columns = glyphColumns(text[i]);
    for (let col = 0; col < 5; col += 1) {
      for (let row = 0; row < 7; row += 1) {
        if ((columns[col] & (1 << row)) === 0) {
          continue;
        }

        const x = charX + col;
        const y = row;
        if (x < 0 || x >= MATRIX_WIDTH || y >= MATRIX_HEIGHT) {
          continue;
        }

        drawLedPixel(
          x,
          y,
          scale,
          colorFn(x, y),
          glowFn(x, y),
          haloFn(x, y),
        );
      }
    }
  }
}

function drawStyledText(text, startX, frame, scale, solidColor) {
  if (currentTextColorFx === "STATIC") {
    drawTextAt(text, startX, scale, solidColor);
    return;
  }

  if (currentTextColorFx === "RAINBOW_STATIC") {
    drawTextAtWithColorFn(text, startX, scale, (x, y) => {
      const hue = (x * 14 + y * 28) % 360;
      return `hsl(${hue} 100% 56%)`;
    });
    return;
  }

  drawTextAtWithColorFn(
    text,
    startX,
    scale,
    (x, y) => {
      const hue = (frame * 8 + x * 14 + y * 24) % 360;
      return `hsl(${hue} 100% 56%)`;
    },
    (x) => 0.9 + (Math.sin((frame + x * 1.8) * 0.16) + 1) * 0.18,
  );
}

function drawTextPreview(frame, scale) {
  const text = normalizeMessage(messageInput.value || " ");
  const width = messageWidth(text);
  const brightness = Number(brightnessInput.value) / 128;
  const color = colorWithAlpha(
    textColorInput.value,
    0.38 + brightness * 0.62,
  );

  if (currentTextMovement === "FLASH") {
    const pages = flashPages(text);
    const flashCycle = FLASH_FRAMES_ON + FLASH_FRAMES_OFF;
    const page = pages[Math.floor(frame / flashCycle) % pages.length];
    if (frame % flashCycle < FLASH_FRAMES_ON) {
      const pageWidth = messageWidth(page);
      drawStyledText(
        page,
        Math.floor((MATRIX_WIDTH - pageWidth) / 2),
        frame,
        scale,
        color,
      );
    }
    return;
  }

  if (currentTextMovement === "CENTER") {
    drawStyledText(
      text,
      Math.floor((MATRIX_WIDTH - width) / 2),
      frame,
      scale,
      color,
    );
    return;
  }

  if (currentTextMovement === "BOUNCE") {
    const minX = Math.min(0, MATRIX_WIDTH - width);
    const maxX = Math.max(0, MATRIX_WIDTH - width);
    const span = maxX - minX;
    if (span === 0) {
      drawStyledText(text, minX, frame, scale, color);
      return;
    }

    const phase = frame % (span * 2);
    const position = phase <= span ? phase : span * 2 - phase;
    drawStyledText(text, minX + position, frame, scale, color);
    return;
  }

  const scrollX = MATRIX_WIDTH - (frame % (width + MATRIX_WIDTH + 1));
  drawStyledText(text, scrollX, frame, scale, color);
}

function drawRainbowPreview(frame, scale) {
  for (let y = 0; y < MATRIX_HEIGHT; y += 1) {
    for (let x = 0; x < MATRIX_WIDTH; x += 1) {
      const hue = (frame * 8 + x * 8 + y * 24) % 360;
      drawLedPixel(x, y, scale, `hsl(${hue} 100% 55%)`, 0.45);
    }
  }
}

function drawScannerPreview(frame, scale) {
  const period = (MATRIX_WIDTH - 1) * 2;
  const phase = frame % period;
  const head = phase < MATRIX_WIDTH ? phase : period - phase;

  for (let y = 0; y < MATRIX_HEIGHT; y += 1) {
    for (let x = 0; x < MATRIX_WIDTH; x += 1) {
      const distance = Math.abs(x - head);
      if (distance > 3) {
        continue;
      }

      const light = Math.max(16, 90 - distance * 22);
      drawLedPixel(x, y, scale, `hsl(8 100% ${light}%)`, 0.7);
    }
  }
}

function drawSparklePreview(frame, scale) {
  for (let y = 0; y < MATRIX_HEIGHT; y += 1) {
    for (let x = 0; x < MATRIX_WIDTH; x += 1) {
      const raw =
        Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + frame * 37.719) *
        43758.5453;
      const sparkle = raw - Math.floor(raw);
      if (sparkle < 0.88) {
        continue;
      }

      const hue = (frame * 23 + x * 17 + y * 41) % 360;
      const light = 44 + ((sparkle - 0.88) / 0.12) * 30;
      drawLedPixel(x, y, scale, `hsl(${hue} 100% ${light}%)`, 0.95);
    }
  }
}

function drawCometPreview(frame, scale) {
  const tailLength = 10;
  const head = frame % (MATRIX_WIDTH + tailLength);

  for (let tail = 0; tail < tailLength; tail += 1) {
    const x = head - tail;
    if (x < 0 || x >= MATRIX_WIDTH) {
      continue;
    }

    const light = 64 - tail * 5;
    for (let y = 0; y < MATRIX_HEIGHT; y += 1) {
      const centerBoost = Math.max(0, 3 - Math.abs(y - 3.5)) * 4;
      drawLedPixel(
        x,
        y,
        scale,
        `hsl(187 100% ${light + centerBoost}%)`,
        0.8,
      );
    }
  }
}

function drawEffectPreview(frame, scale) {
  if (currentVisualMode === "BLANK") {
    return;
  }

  if (currentVisualMode === "RAINBOW") {
    drawRainbowPreview(frame, scale);
  } else if (currentVisualMode === "SCANNER") {
    drawScannerPreview(frame, scale);
  } else if (currentVisualMode === "SPARKLE") {
    drawSparklePreview(frame, scale);
  } else if (currentVisualMode === "COMET") {
    drawCometPreview(frame, scale);
  } else {
    drawTextPreview(frame, scale);
  }
}

function drawPreview(now) {
  const scale = canvas.width / MATRIX_WIDTH;
  const frameMs = Number(speedInput.value);
  const frame = Math.floor((now - previewStart) / frameMs);

  drawPreviewBackground(scale);
  drawEffectPreview(frame, scale);
  ctx.shadowBlur = 0;

  requestAnimationFrame(drawPreview);
}

function bindEvents() {
  connectButton.addEventListener("click", connect);
  disconnectButton.addEventListener("click", disconnect);
  statusButton.addEventListener("click", () => writeCommand("STATUS"));
  clearLogButton.addEventListener("click", () => {
    logList.textContent = "";
  });

  sendMessageButton.addEventListener("click", () => {
    const message = normalizeMessage(messageInput.value);
    messageInput.value = message;
    setMessageEffect();
    previewStart = performance.now();
    saveSettingsToStorage();
    writeCommand(`MSG=${message}`);
  });

  messageInput.addEventListener("input", () => {
    const start = messageInput.selectionStart;
    messageInput.value = normalizeMessage(messageInput.value);
    messageInput.selectionStart = start;
    messageInput.selectionEnd = start;
    previewStart = performance.now();
    saveSettingsToStorage();
  });

  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessageButton.click();
    }
  });

  brightnessInput.addEventListener("input", () => {
    refreshControlLabels();
    saveSettingsToStorage();
  });
  speedInput.addEventListener("input", () => {
    setTextMovementSpeed(currentTextMovement, speedInput.value);
    speedInput.value = getTextMovementSpeed(currentTextMovement);
    refreshControlLabels();
    saveSettingsToStorage();
  });
  textColorInput.addEventListener("input", () => {
    textColorInput.value = normalizeColor(
      textColorInput.value,
      DEFAULT_TEXT_COLOR,
    );
    saveSettingsToStorage();
    if (shouldSendColorUpdate()) {
      writeCommand(
        `FG=${normalizeColor(textColorInput.value, DEFAULT_TEXT_COLOR)}`,
      );
    }
  });
  bgColorInput.addEventListener("input", () => {
    bgColorInput.value = normalizeColor(bgColorInput.value, DEFAULT_BG_COLOR);
    saveSettingsToStorage();
    if (shouldSendColorUpdate()) {
      writeCommand(`BG=${normalizeColor(bgColorInput.value, DEFAULT_BG_COLOR)}`);
    }
  });
  brightnessInput.addEventListener("change", () => {
    saveSettingsToStorage();
    writeCommand(`BRI=${brightnessInput.value}`);
  });
  speedInput.addEventListener("change", () => {
    setTextMovementSpeed(currentTextMovement, speedInput.value);
    speedInput.value = getTextMovementSpeed(currentTextMovement);
    saveSettingsToStorage();
    writeCommand(`SPEED=${speedInput.value}`);
  });
  textColorInput.addEventListener("change", () => {
    saveSettingsToStorage();
    writeCommand(
      `FG=${normalizeColor(textColorInput.value, DEFAULT_TEXT_COLOR)}`,
    );
  });
  bgColorInput.addEventListener("change", () => {
    saveSettingsToStorage();
    writeCommand(`BG=${normalizeColor(bgColorInput.value, DEFAULT_BG_COLOR)}`);
  });

  document.querySelectorAll("[data-message]").forEach((button) => {
    button.addEventListener("click", () => {
      messageInput.value = normalizeMessage(button.dataset.message);
      setMessageEffect();
      previewStart = performance.now();
      saveSettingsToStorage();
      writeCommand(`MSG=${messageInput.value}`);
    });
  });

  effectButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = normalizeVisualMode(button.dataset.effect);
      setCurrentVisualMode(mode);
      if (mode === "TEXT") {
        syncSpeedInputWithTextMovement(currentTextMovement);
      }
      previewStart = performance.now();
      saveSettingsToStorage();
      writeCommand(`MODE=${mode}`);
    });
  });

  motionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const movement = normalizeTextMovement(button.dataset.motion);
      setCurrentVisualMode("TEXT");
      setCurrentTextMovement(movement);
      syncSpeedInputWithTextMovement(movement);
      previewStart = performance.now();
      saveSettingsToStorage();
      writeCommand("MODE=TEXT");
      writeCommand(`TMOVE=${movement}`);
      writeCommand(`SPEED=${getTextMovementSpeed(movement)}`);
    });
  });

  textColorFxButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const textColorFx = normalizeTextColorFx(button.dataset.textColorfx);
      setCurrentVisualMode("TEXT");
      setCurrentTextColorFx(textColorFx);
      previewStart = performance.now();
      saveSettingsToStorage();
      writeCommand("MODE=TEXT");
      writeCommand(`TCLR=${textColorFx}`);
    });
  });
}

function scheduleAutoConnectClick() {
  if (!navigator.bluetooth) {
    return;
  }

  setTimeout(() => {
    if (connectionState !== "disconnected") {
      return;
    }

    connectButton.click();
  }, 1000);
}

function init() {
  if (!navigator.bluetooth) {
    connectButton.disabled = true;
    logLine("Web Bluetooth unavailable in this browser", "error");
  }

  setCurrentVisualMode("TEXT");
  setCurrentTextMovement("SCROLL");
  setCurrentTextColorFx("STATIC");
  loadSettingsFromStorage();
  refreshControlLabels();
  setConnectionState("disconnected");
  bindEvents();
  saveSettingsToStorage();
  autoConnectOnLoad();
  scheduleAutoConnectClick();
  requestAnimationFrame(drawPreview);
}

init();
