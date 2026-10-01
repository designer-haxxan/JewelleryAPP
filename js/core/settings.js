// Lightweight settings stored in LocalStorage.
import { storageKey } from '../config.js';

const KEY = storageKey('settings');

export const DEFAULT_SETTINGS = {
  business: {
    name: 'My Jewellery Shop',
    owner: '',
    address: '',
    city: '',
    phone: '',
    email: '',
    ntn: '',
    footer: 'Thank you! Dobara Zaroor Ayen!',
  },
  receipt: {
    headerMsg: '',
    showOwner: false,
    showNtn: false,
  },
  currency: 'Rs',
  printer: {
    method: 'bluetooth',
    width: 58,
    autoPrint: false,
    copies: 1,
    chunkSize: 20,
    imageMode: 'gsv0',
    deviceName: '',
    deviceId: '',
  },
  theme: 'auto',
  billPrefix: 'BILL',
  pin: '',
};

function merge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over || {})) {
    const v = over[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object'
      ? merge(base[k], v) : v;
  }
  return out;
}

let cache = null;
export function getSettings() {
  if (!cache) {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { stored = {}; }
    cache = merge(DEFAULT_SETTINGS, stored);
  }
  return cache;
}

export function saveSettings(patch) {
  cache = merge(getSettings(), patch);
  localStorage.setItem(KEY, JSON.stringify(cache));
  document.dispatchEvent(new CustomEvent('settings:changed', { detail: cache }));
  return cache;
}

export function replaceSettings(all) {
  cache = merge(DEFAULT_SETTINGS, all || {});
  localStorage.setItem(KEY, JSON.stringify(cache));
  document.dispatchEvent(new CustomEvent('settings:changed', { detail: cache }));
}

export const pref = {
  get(k, d = null) {
    try { const v = localStorage.getItem(storageKey('pref.' + k)); return v === null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) { localStorage.setItem(storageKey('pref.' + k), JSON.stringify(v)); },
};

export function applyTheme() {
  const t = getSettings().theme;
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
}
