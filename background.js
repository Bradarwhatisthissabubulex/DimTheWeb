/* ═══════════════════════════════════════════
   DimTheWeb — Background Service Worker
   ═══════════════════════════════════════════ */

const ALARM_NAME = 'dimtheweb-volume-check';
const DEFAULT_VOLUME = 30;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  initDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});

async function initDefaults() {
  const data = await chrome.storage.local.get(['lofiVolumeMode', 'lofiFixedVolume']);
  if (data.lofiVolumeMode === undefined) {
    chrome.storage.local.set({
      lofiVolumeMode: 'fixed',
      lofiFixedVolume: DEFAULT_VOLUME,
      lofiSchedule: [
        { hour: 0, minute: 0, volume: 10 },
        { hour: 6, minute: 0, volume: 25 },
        { hour: 8, minute: 0, volume: 40 },
        { hour: 12, minute: 0, volume: 35 },
        { hour: 18, minute: 0, volume: 30 },
        { hour: 21, minute: 0, volume: 20 },
        { hour: 23, minute: 0, volume: 12 },
      ],
    });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) updateVolume();
});

async function updateVolume() {
  const data = await chrome.storage.local.get([
    'lofiVolumeMode', 'lofiFixedVolume', 'lofiSchedule',
  ]);
  let volume = DEFAULT_VOLUME;
  if (data.lofiVolumeMode === 'fixed' && data.lofiFixedVolume !== undefined) {
    volume = data.lofiFixedVolume;
  } else if (data.lofiVolumeMode === 'scheduled' && data.lofiSchedule?.length) {
    volume = getScheduledVolume(data.lofiSchedule);
  }
  chrome.storage.local.set({ currentLofiVolume: volume });
}

function getScheduledVolume(schedule) {
  if (!schedule || !schedule.length) return DEFAULT_VOLUME;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const sorted = [...schedule].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  let best = sorted[sorted.length - 1];
  for (const e of sorted) {
    if (e.hour * 60 + e.minute <= cur) best = e;
    else break;
  }
  return Math.max(0, Math.min(100, best.volume));
}
