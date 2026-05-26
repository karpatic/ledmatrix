# BLE Web App

Static Web Bluetooth controller for the ESP32 LED matrix.

Use Chrome or Edge on a platform with Web Bluetooth support. The page must be
served from `localhost` or HTTPS.

Run it from the repo root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

The app connects to the BLE device named `LED-Matrix` and sends the same text
commands documented in the root `README.md`.

The effect buttons send `FX=SCROLL`, `FX=FLASH`, `FX=RAINBOW`, `FX=SCANNER`,
`FX=SPARKLE`, or `FX=COMET`. The color controls send `FG=#RRGGBB` and
`BG=#RRGGBB`. The canvas preview updates immediately when controls change.
Flash mode shows one word or 5-character word chunk at a time so text fits on
the 32x8 matrix.

After the first successful device selection, the app keeps retrying every 2
seconds if the BLE connection drops. Press **Disconnect** to stop reconnecting.
