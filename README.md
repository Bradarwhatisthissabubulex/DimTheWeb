# DimTheWeb

> Dim your tabs, vibe to lofi, stay cozy.

A Chrome extension for per-tab brightness control, dark mode, and lo-fi ambient audio.  
Forked from [light-off](https://github.com/MahdiFayyaziMoghaddam/light-off) by MahdiFayyaziMoghaddam.

## Features

### Brightness Control
- Per-tab brightness slider (0%–100%)
- Sync brightness to all tabs
- 3 quick-save preset slots (left-click load, right-click save)
- Named presets with save/load/delete

### Dark Mode
- Smart page detection — inverts light pages, overlays dark ones
- Applies globally across all tabs

### Lo-Fi Player
- Built-in ambient synth (triangle waves, sub bass, filtered noise, LFO)
- Custom stream URL support (paste any audio stream)
- Fixed or scheduled volume
- Volume schedule with time-based entries (wraps at midnight)
- Audio persists via offscreen document after popup closes

### UI
- Saturn-inspired dark glassmorphism design
- Ambient particles and fireflies
- Noise overlay for depth
- Gold/amber accent palette

## Usage

1. Open the extension popup
2. Drag the brightness slider to dim or brighten the active tab
3. Click the moon icon to toggle dark mode across all tabs
4. Right-click a preset slot to save current brightness; left-click to load
5. Expand the Lo-Fi section and hit play for ambient audio
6. Open Settings to configure volume mode, schedule, stream URL, or named presets

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (Manifest V3) |
| `index.html` | Popup UI |
| `style.css` | Saturn-inspired theme |
| `script.js` | Popup logic |
| `content.js` | Content script (brightness/dark-mode filters) |
| `background.js` | Service worker (volume alarm & init) |
| `offscreen.html` / `offscreen.js` | Persistent audio engine |
| `icons/` | Extension icons (16/32/48/128) |

## Development

Load as an unpacked extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `DimTheWeb` folder

## License

MIT
