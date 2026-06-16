let overlay = null;
let dimOverlay = null;
const OVERLAY_ID = 'dimtheweb-overlay';
const DIM_OVERLAY_ID = 'dimtheweb-dim-overlay';
const DARK_CLASS = 'dimtheweb-dark';
let _currentBrightness = 100;
let _darkModeEnabled = false;
let _pageIsDark = null;   // detected once, cached

// ── Smart page background detection ─────────────
// Determines whether the page already has a dark appearance
// so we can use the right dark-mode strategy.

function detectPageDarkness() {
  const el = document.body || document.documentElement;
  const bg = window.getComputedStyle(el).backgroundColor;
  const match = bg.match(/\d+/g);
  if (match && match.length >= 3) {
    const r = parseInt(match[0]), g = parseInt(match[1]), b = parseInt(match[2]);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance < 128;
  }
  return false;
}

// ── Unified filter application ─────────────────
// Composits brightness and dark-mode filters on the same element,
// avoiding !important conflicts and double-dim issues.

function applyFilters() {
  const filters = [];
  if (_currentBrightness !== 100) {
    filters.push(`brightness(${_currentBrightness / 100})`);
  }

  // Decide dark-mode strategy once
  if (_darkModeEnabled && _pageIsDark === null) {
    _pageIsDark = detectPageDarkness();
  }

  // Light page → CSS invert (produces a true dark mode)
  if (_darkModeEnabled && _pageIsDark === false) {
    filters.push('invert(1) hue-rotate(180deg)');
  }

  const filterStr = filters.join(' ');
  if (filterStr) {
    document.documentElement.style.setProperty('filter', filterStr);
  } else {
    document.documentElement.style.removeProperty('filter');
  }

  // ── Brightness overlay (>100%) ────────────────
  if (_currentBrightness > 100) {
    const pct = Math.min(_currentBrightness, 200);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:white;' +
        `opacity:${(pct - 100) / 100};` +
        'pointer-events:none;z-index:2147483647;transition:opacity 0.15s ease;';
      (document.body || document.documentElement).appendChild(overlay);
    } else {
      overlay.style.display = 'block';
      overlay.style.opacity = (pct - 100) / 100;
    }
  } else if (overlay) {
    overlay.style.display = 'none';
  }

  // ── Dark-mode on already-dark pages ───────────
  // Instead of inverting (which would make a dark site light),
  // use a warm-toned semi-transparent overlay with backdrop-filter.
  if (_darkModeEnabled && _pageIsDark === true) {
    const targetOpacity = 0.55;
    if (!dimOverlay) {
      dimOverlay = document.createElement('div');
      dimOverlay.id = DIM_OVERLAY_ID;
      dimOverlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        `background:rgba(8,8,14,${targetOpacity});` +
        'backdrop-filter:brightness(0.82) sepia(0.08);' +
        '-webkit-backdrop-filter:brightness(0.82) sepia(0.08);' +
        'pointer-events:none;z-index:2147483646;transition:opacity 0.3s ease;';
      (document.body || document.documentElement).appendChild(dimOverlay);
    } else {
      dimOverlay.style.display = 'block';
      dimOverlay.style.opacity = targetOpacity;
    }
  } else if (dimOverlay) {
    dimOverlay.style.display = 'none';
  }

  // Manage the dark-mode un-invert style for media (only when using invert)
  updateDarkStyle();
}

function updateDarkStyle() {
  const existing = document.getElementById('dimtheweb-dark-style');
  if (_darkModeEnabled && _pageIsDark === false) {
    if (!existing) {
      const style = document.createElement('style');
      style.id = 'dimtheweb-dark-style';
      style.textContent =
        `html.${DARK_CLASS} img, ` +
        `html.${DARK_CLASS} video, ` +
        `html.${DARK_CLASS} canvas, ` +
        `html.${DARK_CLASS} [style*="background-image"] { ` +
        `filter: invert(1) hue-rotate(180deg) !important; }`;
      document.documentElement.appendChild(style);
    }
    document.documentElement.classList.add(DARK_CLASS);
  } else {
    document.documentElement.classList.remove(DARK_CLASS);
    if (existing) existing.remove();
  }
}

function removeExistingOverlay() {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) { existing.remove(); overlay = null; }
  const dim = document.getElementById(DIM_OVERLAY_ID);
  if (dim) { dim.remove(); dimOverlay = null; }
}

function setBrightness(value) {
  _currentBrightness = value;
  applyFilters();
}

function getCurrentBrightness() {
  const match = document.documentElement.style.filter.match(/brightness\(([0-9.]+)\)/);
  if (match) return parseFloat(match[1]) * 100;
  if (_currentBrightness > 100 && overlay && overlay.style.display !== 'none') {
    return 100 + parseFloat(overlay.style.opacity) * 100;
  }
  return _currentBrightness;
}

function setDarkMode(enabled) {
  _darkModeEnabled = enabled;
  // Reset cached darkness so we re-detect on next apply
  if (!enabled) _pageIsDark = null;
  applyFilters();
}

// ── Message handling ────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PING') {
    sendResponse({ pong: true });
  } else if (request.type === 'SET_BRIGHTNESS') {
    setBrightness(request.value);
    sendResponse({ success: true });
  } else if (request.type === 'GET_BRIGHTNESS') {
    sendResponse({ value: getCurrentBrightness() });
  } else if (request.type === 'TOGGLE_DARK_MODE') {
    setDarkMode(request.value);
    sendResponse({ success: true });
  }
  return true;
});

// Re-apply filters after full DOM is ready (ensures overlay is attached to body)
document.addEventListener('DOMContentLoaded', () => {
  if (_currentBrightness !== 100 || _darkModeEnabled) applyFilters();
});
