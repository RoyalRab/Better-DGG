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
};

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

// Reloads started by the app (Refresh, an update). The flag tells the next
// page load it isn't a fresh launch from the icon, whatever the browser says.
export function reloadApp() {
  try {
    sessionStorage.setItem('bdgg:reloaded', '1');
  } catch {}
  location.reload();
}
export const wasReloaded = (() => {
  try {
    return sessionStorage.getItem('bdgg:reloaded') === '1';
  } catch {
    return false;
  }
})();

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
