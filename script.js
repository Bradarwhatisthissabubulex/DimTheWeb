/* ═══════════════════════════════════════════
   DimTheWeb — Popup Script
   ═══════════════════════════════════════════ */

let particles, fireflies;
let volumeUpdateInterval = null;
let lofi = null;
let currentTabId = null;

const $ = (id) => document.getElementById(id);

const dom = {
  brightnessSlider: $('brightnessSlider'),
  brightnessValue: $('brightnessValue'),
  resetBtn: $('resetBtn'),
  syncBrightnessBtn: $('syncBrightnessBtn'),
  sunIcon: $('sunIcon'),
  tabLabel: $('tabLabel'),

  lofiToggleBtn: $('lofiToggleBtn'),
  lofiBody: $('lofiBody'),
  lofiStatusDot: $('lofiStatusDot'),
  nowPlayingLabel: $('nowPlayingLabel'),
  playBtn: $('playBtn'),
  volSlider: $('volSlider'),
  volDisplay: $('volDisplay'),
  volModeBadge: $('volModeBadge'),
  volScheduleInfo: $('volScheduleInfo'),

  settingsToggleBtn: $('settingsToggleBtn'),
  settingsCloseBtn: $('settingsCloseBtn'),
  settingsPanel: $('settingsPanel'),

  modeFixed: $('modeFixed'),
  modeScheduled: $('modeScheduled'),
  fixedVolSection: $('fixedVolSection'),
  fixedVolSlider: $('fixedVolSlider'),
  fixedVolDisplay: $('fixedVolDisplay'),
  scheduleSection: $('scheduleSection'),
  scheduleList: $('scheduleList'),
  addScheduleBtn: $('addScheduleBtn'),

  streamUrlInput: $('streamUrlInput'),
  applyStreamUrlBtn: $('applyStreamUrlBtn'),

  darkModeToggle: $('darkModeToggle'),
  presetBtns: [$('presetBtn1'), $('presetBtn2'), $('presetBtn3')],
  presetSaveBtn: $('presetSaveBtn'),
  presetList: $('presetList'),
  presetNameInput: $('presetNameInput'),
  savePresetBtn: $('savePresetBtn'),
};

// ── Content Script Messaging ───────────────────
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return true;
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId }, files: ['content.js'],
      });
      await new Promise((r) => setTimeout(r, 150));
      return true;
    } catch (_) { return false; }
  }
}

async function sendToTab(tabId, msg) {
  for (let i = 0; i < 3; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (_) {
      if (i === 0) await ensureContentScript(tabId);
      if (i < 2) await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
}

async function sendToAllTabs(msg) {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    try { await sendToTab(t.id, msg); } catch (_) {}
  }
}

async function applyBrightness(tabId, value) {
  try { await sendToTab(tabId, { type: 'SET_BRIGHTNESS', value }); } catch (_) {}
}

async function applyDarkMode(tabId, value) {
  try { await sendToTab(tabId, { type: 'TOGGLE_DARK_MODE', value }); } catch (_) {}
}

// ── Particles ──────────────────────────────────
class ParticleSystem {
  constructor(containerId, count, type) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.count = count;
    this.type = type;
    this.running = false;
  }
  start() {
    if (this.running || !this.container) return;
    this.running = true;
    this.spawn();
  }
  stop() {
    this.running = false;
    if (this.container) this.container.innerHTML = '';
  }
  spawn() {
    if (!this.running || !this.container) return;
    this.container.innerHTML = '';
    for (let i = 0; i < this.count; i++) {
      const el = document.createElement('div');
      el.className = this.type === 'firefly' ? 'firefly' : 'particle';
      el.style.left = Math.random() * 100 + '%';
      el.style.top = Math.random() * 100 + '%';
      if (this.type === 'particle') {
        const s = 1 + Math.random() * 3;
        el.style.width = s + 'px';
        el.style.height = s + 'px';
        el.style.animationDuration = (5 + Math.random() * 8) + 's';
        el.style.animationDelay = (Math.random() * 5) + 's';
      } else {
        el.style.width = el.style.height = (2 + Math.random() * 3) + 'px';
        el.style.animationDuration = (3 + Math.random() * 4) + 's';
        el.style.animationDelay = (Math.random() * 3) + 's';
      }
      this.container.appendChild(el);
    }
  }
}

// ── Lo-Fi Engine ───────────────────────────────
class LofiAmbient {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.nodes = [];
    this.playing = false;
    this.volume = 30;
    this.streamAudio = null;
    this.streamSource = null;
    this.currentSource = 'builtin';
    this.streamUrl = '';
    this.vizInterval = null;
  }
  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);
  }
  async start() {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.playing = true;
    this.applyVolume();
    if (this.currentSource === 'stream' && this.streamUrl) this.startStream();
    else this.startBuiltin();
    this.startViz();
    $('#visualizer')?.classList.add('active');
    $('#lofiStatusDot')?.classList.add('playing');
  }
  stop() {
    this.playing = false;
    this.stopAllNodes();
    this.stopViz();
    if (this.streamAudio) { this.streamAudio.pause(); this.streamAudio = null; this.streamSource = null; }
    $('#visualizer')?.classList.remove('active');
    $('#lofiStatusDot')?.classList.remove('playing');
    document.querySelectorAll('.visualizer .bar').forEach((b) => { b.style.height = '2px'; });
  }
  stopAllNodes() {
    this.nodes.forEach((n) => { try { n.stop?.(); } catch (_) {} try { n.disconnect?.(); } catch (_) {} });
    this.nodes = [];
  }
  startViz() {
    this.stopViz();
    this.vizInterval = setInterval(() => {
      document.querySelectorAll('.visualizer .bar').forEach((b) => {
        b.style.height = (3 + Math.random() * 28) + 'px';
      });
    }, 140);
  }
  stopViz() { if (this.vizInterval) { clearInterval(this.vizInterval); this.vizInterval = null; } }
  startBuiltin() {
    this.stopAllNodes();
    [261.63, 329.63, 392.0, 493.88, 587.33].forEach((freq) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 3;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500 + Math.random() * 300; f.Q.value = 0.5;
      const g = this.ctx.createGain();
      g.gain.value = 0.035;
      osc.connect(f); f.connect(g); g.connect(this.masterGain);
      osc.start();
      this.nodes.push(osc, f, g);
    });
    const sub = this.ctx.createOscillator();
    sub.type = 'sine'; sub.frequency.value = 65.41;
    const sg = this.ctx.createGain();
    sg.gain.value = 0.05;
    sub.connect(sg); sg.connect(this.masterGain);
    sub.start();
    this.nodes.push(sub, sg);
    this.createNoise();
    this.createLFO();
  }
  createNoise() {
    const bufSize = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * 0.002;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 120;
    const g = this.ctx.createGain();
    g.gain.value = 0.006;
    src.connect(f); f.connect(g); g.connect(this.masterGain);
    src.start();
    this.nodes.push(src, f, g);
  }
  createLFO() {
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.08;
    const lg = this.ctx.createGain();
    lg.gain.value = 80;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 450; f.Q.value = 1;
    lfo.connect(lg); lg.connect(f.frequency);
    this.masterGain.disconnect();
    this.masterGain.connect(f); f.connect(this.ctx.destination);
    lfo.start();
    this.nodes.push(lfo, lg, f);
  }
  startStream() {
    if (!this.streamUrl) return;
    this.stopAllNodes();
    try { this.masterGain.disconnect(); } catch (_) {}
    this.masterGain.connect(this.ctx.destination);
    this.streamAudio = new Audio(this.streamUrl);
    this.streamAudio.loop = false;
    this.streamAudio.crossOrigin = 'anonymous';
    this.streamSource = this.ctx.createMediaElementSource(this.streamAudio);
    this.streamSource.connect(this.masterGain);
    this.streamAudio.play().catch(() => { this.currentSource = 'builtin'; this.startBuiltin(); });
  }
  setStreamSource(url) { this.currentSource = url ? 'stream' : 'builtin'; if (url) this.streamUrl = url; }
  setVolume(vol) { this.volume = Math.max(0, Math.min(100, vol)); this.applyVolume(); }
  applyVolume() {
    if (!this.masterGain) return;
    const n = this.volume / 100;
    this.masterGain.gain.setTargetAtTime(Math.pow(n, 1.4) * 0.35, this.ctx?.currentTime || 0, 0.1);
  }
  toggle() { if (this.playing) { this.stop(); return false; } this.start(); return true; }
  destroy() { this.stop(); if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; } }
}

// ── UI Helpers ─────────────────────────────────
function updateSliderFill(slider) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.background = `linear-gradient(to right, var(--accent-gold) ${pct}%, rgba(255,255,255,0.06) ${pct}%)`;
}

function updateSunRays(pct) {
  document.querySelectorAll('.sun-icon .ray').forEach((r) => {
    r.style.strokeDashoffset = 6 * (1 - pct / 100);
  });
  dom.sunIcon?.classList.toggle('dim', pct < 30);
}

function getCurrentMinutes() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

function getScheduledVolume(schedule) {
  if (!schedule || !schedule.length) return null;
  const cur = getCurrentMinutes();
  const sorted = [...schedule].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  let best = sorted[sorted.length - 1];
  for (const e of sorted) { if (e.hour * 60 + e.minute <= cur) best = e; else break; }
  return best.volume;
}

function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ── Brightness ─────────────────────────────────
async function initBrightness() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab) return;
  currentTabId = tab.id;

  const data = await chrome.storage.local.get('brightness_' + tab.id);
  const val = data['brightness_' + tab.id] ?? 100;

  dom.brightnessSlider.value = val;
  dom.brightnessValue.textContent = Math.round(val) + '%';
  updateSliderFill(dom.brightnessSlider);
  updateSunRays(val);
  await applyBrightness(tab.id, val);

  try {
    const domain = new URL(tab.url || '').hostname.replace('www.', '');
    if (dom.tabLabel) dom.tabLabel.textContent = domain;
  } catch (_) {}
}

async function onBrightnessChange(e) {
  const val = parseFloat(e.target.value);
  dom.brightnessValue.textContent = Math.round(val) + '%';
  updateSliderFill(e.target);
  updateSunRays(val);
  if (currentTabId) {
    await chrome.storage.local.set({ ['brightness_' + currentTabId]: val });
    applyBrightness(currentTabId, val);
  }
}

async function onSyncAll() {
  const val = parseFloat(dom.brightnessSlider.value);
  await sendToAllTabs({ type: 'SET_BRIGHTNESS', value: val });
}

async function onReset() {
  dom.brightnessSlider.value = 100;
  dom.brightnessValue.textContent = '100%';
  updateSliderFill(dom.brightnessSlider);
  updateSunRays(100);
  if (currentTabId) {
    await chrome.storage.local.set({ ['brightness_' + currentTabId]: 100 });
    applyBrightness(currentTabId, 100);
  }
}

// ── Presets ────────────────────────────────────
async function refreshPresetButtons() {
  const data = await chrome.storage.local.get(['preset1', 'preset2', 'preset3']);
  dom.presetBtns.forEach((btn, i) => {
    if (!btn) return;
    const key = 'preset' + (i + 1);
    const val = data[key];
    if (val != null) {
      btn.textContent = Math.round(val) + '%';
      btn.style.display = '';
      btn._value = val;
    } else {
      btn.textContent = '-';
      btn.style.display = '';
      btn._value = null;
    }
  });
}

function onPresetClick(i) {
  const btn = dom.presetBtns[i];
  if (!btn || btn._value == null) return;
  const val = btn._value;
  dom.brightnessSlider.value = val;
  dom.brightnessValue.textContent = Math.round(val) + '%';
  updateSliderFill(dom.brightnessSlider);
  updateSunRays(val);
  if (currentTabId) {
    chrome.storage.local.set({ ['brightness_' + currentTabId]: val });
    applyBrightness(currentTabId, val);
  }
}

async function onPresetRightClick(e, i) {
  e.preventDefault();
  const val = parseFloat(dom.brightnessSlider.value);
  await chrome.storage.local.set({ ['preset' + (i + 1)]: val });
  refreshPresetButtons();
}

async function loadNamedPresets() {
  const data = await chrome.storage.local.get('brightnessPresets');
  const presets = data.brightnessPresets || [];
  dom.presetList.innerHTML = '';
  if (!presets.length) {
    dom.presetList.innerHTML = '<div class="schedule-hint">No named presets saved.</div>';
    return;
  }
  presets.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'preset-item';
    div.innerHTML =
      `<span class="preset-name">${escHtml(p.name)}</span>` +
      `<span class="preset-val">${Math.round(p.value)}%</span>` +
      `<div>` +
      `<button class="preset-load-btn" data-i="${i}">Load</button>` +
      `<button class="preset-del-btn" data-i="${i}">&times;</button>` +
      `</div>`;
    div.querySelector('.preset-load-btn').onclick = () => {
      const v = presets[i].value;
      dom.brightnessSlider.value = v;
      dom.brightnessValue.textContent = Math.round(v) + '%';
      updateSliderFill(dom.brightnessSlider);
      updateSunRays(v);
      if (currentTabId) {
        chrome.storage.local.set({ ['brightness_' + currentTabId]: v });
        applyBrightness(currentTabId, v);
      }
    };
    div.querySelector('.preset-del-btn').onclick = async () => {
      presets.splice(i, 1);
      await chrome.storage.local.set({ brightnessPresets: presets });
      loadNamedPresets();
    };
    dom.presetList.appendChild(div);
  });
}

async function saveNamedPreset() {
  const name = dom.presetNameInput?.value.trim();
  if (!name) return;
  const val = parseFloat(dom.brightnessSlider.value);
  const data = await chrome.storage.local.get('brightnessPresets');
  const presets = data.brightnessPresets || [];
  presets.push({ name, value: val });
  await chrome.storage.local.set({ brightnessPresets: presets });
  dom.presetNameInput.value = '';
  loadNamedPresets();
}

// ── Dark Mode ──────────────────────────────────
function getDarkModeCheckbox() {
  return dom.darkModeToggle?.querySelector('input[type="checkbox"]');
}

async function initDarkMode() {
  const data = await chrome.storage.local.get('darkModeEnabled');
  const enabled = !!data.darkModeEnabled;
  const cb = getDarkModeCheckbox();
  if (cb) cb.checked = enabled;
  if (currentTabId) applyDarkMode(currentTabId, enabled);
}

async function onDarkModeToggle(e) {
  let cb;
  if (e?.target) { cb = e.target.closest('.toggle-switch')?.querySelector('input[type="checkbox"]'); }
  if (!cb) cb = getDarkModeCheckbox();
  if (!cb) return;
  const enabled = cb.checked;
  await chrome.storage.local.set({ darkModeEnabled: enabled });
  await sendToAllTabs({ type: 'TOGGLE_DARK_MODE', value: enabled });
}

// ── Lo-Fi ──────────────────────────────────────
function toggleLofiSection() {
  dom.lofiBody?.classList.toggle('open');
}

async function onLofiPlay() {
  const playing = lofi.toggle();
  if (playing) {
    dom.playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    dom.playBtn.classList.add('playing');
    dom.lofiStatusDot?.classList.add('playing');
    dom.nowPlayingLabel.textContent = 'Playing';
  } else {
    dom.playBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>';
    dom.playBtn.classList.remove('playing');
    dom.lofiStatusDot?.classList.remove('playing');
    dom.nowPlayingLabel.textContent = 'Idle';
    $('#visualizer')?.classList.remove('active');
    document.querySelectorAll('.visualizer .bar').forEach((b) => b.style.height = '2px');
  }
}

function onLofiVolumeChange(e) {
  const vol = parseInt(e.target.value);
  dom.volDisplay.textContent = vol;
  lofi.setVolume(vol);
  if (dom.fixedVolSlider) {
    dom.fixedVolSlider.value = vol;
    dom.fixedVolDisplay.textContent = vol + '%';
    updateSliderFill(dom.fixedVolSlider);
  }
  dom.volModeBadge.textContent = 'Fixed ' + vol;
  chrome.storage.local.set({ lofiFixedVolume: vol });
}

// ── Settings ───────────────────────────────────
function openSettings() { dom.settingsPanel?.classList.add('open'); }
function closeSettings() { dom.settingsPanel?.classList.remove('open'); }

// ── Volume Mode ────────────────────────────────
function setVolumeMode(mode) {
  dom.modeFixed?.classList.toggle('active', mode === 'fixed');
  dom.modeScheduled?.classList.toggle('active', mode === 'scheduled');
  dom.fixedVolSection.style.display = mode === 'fixed' ? '' : 'none';
  dom.scheduleSection.style.display = mode === 'scheduled' ? '' : 'none';
  const vr = document.querySelector('.volume-row');
  if (vr) vr.style.display = mode === 'scheduled' ? 'none' : '';
  chrome.storage.local.set({ lofiVolumeMode: mode });
  checkScheduledVolume();
}

function onFixedVolumeChange(e) {
  const vol = parseInt(e.target.value);
  dom.fixedVolDisplay.textContent = vol + '%';
  updateSliderFill(e.target);
  if (dom.volSlider) { dom.volSlider.value = vol; dom.volDisplay.textContent = vol; }
  lofi.setVolume(vol);
  dom.volModeBadge.textContent = 'Fixed ' + vol;
  chrome.storage.local.set({ lofiFixedVolume: vol });
}

async function loadSettings() {
  const data = await chrome.storage.local.get([
    'lofiVolumeMode', 'lofiFixedVolume', 'lofiSchedule', 'currentLofiVolume',
  ]);
  const mode = data.lofiVolumeMode || 'fixed';
  setVolumeMode(mode);
  const fv = data.lofiFixedVolume ?? 30;
  if (dom.fixedVolSlider) {
    dom.fixedVolSlider.value = fv;
    dom.fixedVolDisplay.textContent = fv + '%';
    updateSliderFill(dom.fixedVolSlider);
  }
  const sv = (mode === 'scheduled' && data.currentLofiVolume != null) ? data.currentLofiVolume : fv;
  if (dom.volSlider) { dom.volSlider.value = sv; dom.volDisplay.textContent = sv; }
  lofi.setVolume(sv);
  if (mode === 'fixed') {
    dom.volModeBadge.textContent = 'Fixed ' + sv;
    dom.volModeBadge.className = 'vol-source-badge fixed';
    dom.volScheduleInfo.style.display = 'none';
  }
  renderSchedule(data.lofiSchedule || getDefaultSchedule());
}

function getDefaultSchedule() {
  return [
    { hour: 0, minute: 0, volume: 10 },
    { hour: 6, minute: 0, volume: 25 },
    { hour: 8, minute: 0, volume: 40 },
    { hour: 12, minute: 0, volume: 35 },
    { hour: 18, minute: 0, volume: 30 },
    { hour: 21, minute: 0, volume: 20 },
    { hour: 23, minute: 0, volume: 12 },
  ];
}

// ── Schedule ───────────────────────────────────
function renderSchedule(schedule) {
  dom.scheduleList.innerHTML = '';
  if (!schedule || !schedule.length) {
    dom.scheduleList.innerHTML = '<div class="schedule-hint">No schedule entries yet.</div>';
    return;
  }
  [...schedule].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)).forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'schedule-entry';
    div.innerHTML =
      `<div class="entry-time">` +
      `<input type="number" min="0" max="23" value="${String(entry.hour).padStart(2, '0')}" class="sch-hour" />` +
      `<span class="entry-sep">:</span>` +
      `<input type="number" min="0" max="59" value="${String(entry.minute).padStart(2, '0')}" class="sch-minute" />` +
      `</div>` +
      `<div class="entry-vol">` +
      `<input type="range" min="0" max="100" value="${entry.volume}" class="sch-vol" />` +
      `<span class="sch-vol-display">${entry.volume}</span>` +
      `</div>` +
      `<button class="entry-del-btn">&times;</button>`;
    const hi = div.querySelector('.sch-hour');
    const mi = div.querySelector('.sch-minute');
    const vs = div.querySelector('.sch-vol');
    const vd = div.querySelector('.sch-vol-display');
    const save = () => {
      hi.value = String(Math.max(0, Math.min(23, parseInt(hi.value) || 0))).padStart(2, '0');
      mi.value = String(Math.max(0, Math.min(59, parseInt(mi.value) || 0))).padStart(2, '0');
      vd.textContent = Math.max(0, Math.min(100, parseInt(vs.value) || 0));
      saveSchedule();
    };
    hi.addEventListener('change', save);
    mi.addEventListener('change', save);
    vs.addEventListener('input', () => { vd.textContent = vs.value; save(); });
    div.querySelector('.entry-del-btn').addEventListener('click', () => {
      div.remove(); saveSchedule(); checkScheduledVolume();
    });
    dom.scheduleList.appendChild(div);
  });
}

function addScheduleEntry() {
  const entries = dom.scheduleList.querySelectorAll('.schedule-entry');
  let hour = new Date().getHours() + 1;
  let minute = 0;
  if (entries.length > 0) {
    const last = entries[entries.length - 1];
    const total = (parseInt(last.querySelector('.sch-hour')?.value || '0')) * 60 +
                   parseInt(last.querySelector('.sch-minute')?.value || '0') + 60;
    hour = Math.floor(total / 60) % 24;
    minute = total % 60;
  } else hour = hour % 24;
  const s = getScheduleFromDOM();
  s.push({ hour, minute, volume: 30 });
  renderSchedule(s);
  saveSchedule();
}

function getScheduleFromDOM() {
  return [...dom.scheduleList.querySelectorAll('.schedule-entry')].map((el) => ({
    hour: Math.max(0, Math.min(23, parseInt(el.querySelector('.sch-hour')?.value || '0'))),
    minute: Math.max(0, Math.min(59, parseInt(el.querySelector('.sch-minute')?.value || '0'))),
    volume: Math.max(0, Math.min(100, parseInt(el.querySelector('.sch-vol')?.value || '0'))),
  })).sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

function saveSchedule() {
  chrome.storage.local.set({ lofiSchedule: getScheduleFromDOM() });
  checkScheduledVolume();
}

async function checkScheduledVolume() {
  const data = await chrome.storage.local.get([
    'lofiVolumeMode', 'lofiFixedVolume', 'lofiSchedule', 'currentLofiVolume',
  ]);
  const mode = data.lofiVolumeMode || 'fixed';
  let vol;
  if (mode === 'scheduled' && data.lofiSchedule?.length) {
    vol = getScheduledVolume(data.lofiSchedule) ?? data.lofiFixedVolume ?? 30;
    const now = getCurrentMinutes();
    const sorted = [...data.lofiSchedule].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    let active = sorted[sorted.length - 1];
    for (const e of sorted) { if (e.hour * 60 + e.minute <= now) active = e; else break; }
    dom.volModeBadge.textContent = 'Scheduled ' + vol;
    dom.volModeBadge.className = 'vol-source-badge scheduled';
    dom.volScheduleInfo.textContent = 'at ' + String(active.hour).padStart(2, '0') + ':' + String(active.minute).padStart(2, '0');
    dom.volScheduleInfo.style.display = '';
  } else {
    vol = data.lofiFixedVolume ?? 30;
    dom.volModeBadge.textContent = 'Fixed ' + vol;
    dom.volModeBadge.className = 'vol-source-badge fixed';
    dom.volScheduleInfo.style.display = 'none';
  }
  if (dom.volSlider) { dom.volSlider.value = vol; dom.volDisplay.textContent = vol; }
  lofi.setVolume(vol);
  chrome.storage.local.set({ currentLofiVolume: vol });
  const vr = document.querySelector('.volume-row');
  if (vr) vr.style.display = mode === 'scheduled' ? 'none' : '';
}

function applyStreamUrl() {
  const url = dom.streamUrlInput?.value.trim();
  if (!url) { lofi.setStreamSource(''); return; }
  try { new URL(url); } catch {
    dom.streamUrlInput.style.borderColor = 'var(--danger)';
    setTimeout(() => { dom.streamUrlInput.style.borderColor = ''; }, 1500);
    return;
  }
  lofi.setStreamSource(url);
  if (lofi.playing) { lofi.stop(); lofi.start(); }
}

// ── Init ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  lofi = new LofiAmbient();
  particles = new ParticleSystem('particles', 30, 'particle');
  fireflies = new ParticleSystem('fireflies', 8, 'firefly');
  particles.start();
  fireflies.start();

  await initBrightness();

  dom.brightnessSlider?.addEventListener('input', onBrightnessChange);
  dom.resetBtn?.addEventListener('click', onReset);
  dom.syncBrightnessBtn?.addEventListener('click', onSyncAll);

  // Preset buttons — click to load, right-click to save
  dom.presetBtns.forEach((btn, i) => {
    if (!btn) return;
    btn.addEventListener('click', () => onPresetClick(i));
    btn.addEventListener('contextmenu', (e) => onPresetRightClick(e, i));
  });
  dom.presetSaveBtn?.addEventListener('click', saveNamedPreset);
  dom.savePresetBtn?.addEventListener('click', saveNamedPreset);
  dom.presetNameInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNamedPreset(); });

  dom.lofiToggleBtn?.addEventListener('click', toggleLofiSection);
  dom.playBtn?.addEventListener('click', onLofiPlay);
  dom.volSlider?.addEventListener('input', onLofiVolumeChange);

  dom.settingsToggleBtn?.addEventListener('click', openSettings);
  dom.settingsCloseBtn?.addEventListener('click', closeSettings);

  dom.modeFixed?.addEventListener('click', () => setVolumeMode('fixed'));
  dom.modeScheduled?.addEventListener('click', () => setVolumeMode('scheduled'));
  dom.fixedVolSlider?.addEventListener('input', onFixedVolumeChange);
  dom.addScheduleBtn?.addEventListener('click', addScheduleEntry);

  dom.applyStreamUrlBtn?.addEventListener('click', applyStreamUrl);
  dom.streamUrlInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyStreamUrl(); });

  dom.darkModeToggle?.addEventListener('click', onDarkModeToggle);

  await loadSettings();
  await refreshPresetButtons();
  await loadNamedPresets();
  await initDarkMode();

  volumeUpdateInterval = setInterval(checkScheduledVolume, 15000);
  checkScheduledVolume();

  window.addEventListener('beforeunload', () => {
    if (volumeUpdateInterval) clearInterval(volumeUpdateInterval);
  });
});

document.addEventListener('click', (e) => {
  if (dom.settingsPanel?.classList.contains('open') &&
      !dom.settingsPanel.contains(e.target) &&
      !dom.settingsToggleBtn?.contains(e.target)) closeSettings();
});
