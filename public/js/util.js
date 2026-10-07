// Small helpers shared by the rest of the app: DOM lookup, saved settings,
// the toast, screen reader announcements and what kind of device this is.

export const $ = (sel) => document.querySelector(sel);

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('bdgg:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('bdgg:' + key, JSON.stringify(value));
    } catch {}
  },
};

export const settings = {
  keepAwake: store.get('keepAwake', true),
  ownPlayer: store.get('ownPlayer', true),
  showChat: store.get('showChat', true),
  chatLeft: store.get('chatLeft', false),
  errorReports: store.get('errorReports', false),
  audioOnly: store.get('audioOnly', false), // Kick in the app's own player: sound only
  kickQuality: store.get('kickQuality', 'auto'), // 'auto' or a height like 720
  dataSaver: store.get('dataSaver', true), // cap Kick at 480p on mobile data
  landscapeFull: store.get('landscapeFull', false), // phones: landscape fills the screen, chat over the stream
  push: store.get('push', false), // 'Destiny is live' notifications (subscribed with the server)
  theme: store.get('theme', 'dark'), // a THEMES id (menu.js); 'custom' uses themeCustom
  themeCustom: store.get('themeCustom', { bg: '#0b0d12', accent: '#2f7cf6' }),
};

// Black or white text, whichever reads on this colour.
export function onColor(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.6 ? '#000' : '#fff';
}

// Sets the theme on <html> (app.css has the colours per theme; Custom gets
// its two colours as variables) and matches the browser's own bar to it.
export function applyTheme() {
  const root = document.documentElement;
  const id = /^[a-z]+$/.test(settings.theme) ? settings.theme : 'dark';
  root.dataset.theme = id;
  const c = settings.themeCustom || {};
  const ok = (v) => /^#[0-9a-f]{6}$/i.test(v);
  if (id === 'custom' && ok(c.bg) && ok(c.accent)) {
    root.style.setProperty('--c-bg', c.bg);
    root.style.setProperty('--c-accent', c.accent);
    root.style.setProperty('--on-accent', onColor(c.accent));
  } else {
    for (const v of ['--c-bg', '--c-accent', '--on-accent']) root.style.removeProperty(v);
    if (id === 'custom') root.dataset.theme = 'dark';
  }
  const panel = getComputedStyle(root).getPropertyValue('--panel').trim();
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta && panel) meta.setAttribute('content', panel);
}
applyTheme();

export function saveSetting(key, value) {
  settings[key] = value;
  store.set(key, value);
}

let toastTimer;
export function toast(msg, ms = 2500) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// Tells screen readers about changes that aren't otherwise announced, like
// switching streams.
export function announce(msg) {
  const el = $('#sr-status');
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = msg;
  });
}

const ua = navigator.userAgent;
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/.test(ua);
export const isTouch = window.matchMedia('(pointer: coarse)').matches;
export const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Side by side (player left, chat right): landscape phones, tablets, desktops
// and ultrawides. Keep in sync with the row layout media query in app.css.
export const rowLayoutQuery = window.matchMedia(
  '(orientation: landscape) and (min-aspect-ratio: 4/3), (min-width: 1000px) and (min-aspect-ratio: 1/1)',
);
export const isRowLayout = () => rowLayoutQuery.matches;

// Reloads started by the app (Refresh, an update).
export function reloadApp() {
  location.reload();
}

// Opt-in error reports: what failed, the app version and the kind of browser
// (the server works that out from the request), nothing about the person.
export function report(kind, detail = '') {
  if (!settings.errorReports) return;
  try {
    const version = document.querySelector('meta[name="app-version"]')?.content || '';
    fetch('api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, detail: String(detail).slice(0, 300), version }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
