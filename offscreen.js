/* ═══════════════════════════════════════════
   DimTheWeb — Offscreen Audio Engine
   Runs persistently so lo-fi keeps playing
   when the popup closes.
   ═══════════════════════════════════════════ */

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
    this.broadcastState();
  }

  stop() {
    this.playing = false;
    this.stopAllNodes();
    if (this.streamAudio) { this.streamAudio.pause(); this.streamAudio = null; this.streamSource = null; }
    this.broadcastState();
  }

  stopAllNodes() {
    this.nodes.forEach((n) => { try { n.stop?.(); } catch (_) {} try { n.disconnect?.(); } catch (_) {} });
    this.nodes = [];
  }

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

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(100, vol));
    this.applyVolume();
    this.broadcastState();
  }

  applyVolume() {
    if (!this.masterGain) return;
    const n = this.volume / 100;
    this.masterGain.gain.setTargetAtTime(Math.pow(n, 1.4) * 0.35, this.ctx?.currentTime || 0, 0.1);
  }

  toggle() { if (this.playing) { this.stop(); return false; } this.start(); return true; }

  destroy() { this.stop(); if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; } }

  broadcastState() {
    chrome.storage.local.set({
      lofiPlaying: this.playing,
      lofiVolume: this.volume,
      lofiCurrentSource: this.currentSource,
    });
  }
}

// ── Offscreen Document Message Handler ────────
const lofi = new LofiAmbient();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'LOFI_START':
      lofi.start().then(() => sendResponse({ playing: true }));
      break;
    case 'LOFI_STOP':
      lofi.stop();
      sendResponse({ playing: false });
      break;
    case 'LOFI_TOGGLE': {
      const nowPlaying = lofi.toggle();
      sendResponse({ playing: nowPlaying });
      break;
    }
    case 'LOFI_SET_VOLUME':
      lofi.setVolume(request.value);
      sendResponse({ volume: lofi.volume });
      break;
    case 'LOFI_SET_STREAM':
      lofi.setStreamSource(request.url || '');
      sendResponse({ currentSource: lofi.currentSource });
      break;
    case 'LOFI_GET_STATE':
      sendResponse({
        playing: lofi.playing,
        volume: lofi.volume,
        currentSource: lofi.currentSource,
      });
      break;
    default:
      sendResponse({ error: 'unknown type' });
  }
  return true; // keep channel open for async response
});
