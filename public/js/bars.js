// Notice bars at the top: update ready, what's new, offline, and restore
// multi-view.

import { MAX_TILES, parseSource } from './sources.js';
import { state } from './state.js';
import { $, store, reloadApp } from './util.js';
import { layoutTiles, mountTile, setTiles } from './stage.js';
import { refreshTabs } from './tabs.js';
import { openSheet, renderChangelog } from './menu.js';

function showBar(id, on) {
  $(id).hidden = !on;
  layoutTiles();
}

// ---------- Updates ----------
// The service worker opens the app from the phone's cache (instant, works on
// bad signal) and downloads new versions in the background. When one is
// ready, a bar offers to switch to it.

let waitingWorker = null;

function showUpdateReady(worker) {
  waitingWorker = worker;
  showBar('#update-bar', true);
}

export function applyUpdateOrReload() {
  if (waitingWorker) waitingWorker.postMessage('skipWaiting');
  else reloadApp();
}

$('#update-yes').addEventListener('click', applyUpdateOrReload);

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only when the user asked for the update (not on the very first install).
    if (reloading || !waitingWorker) return;
    reloading = true;
    reloadApp();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateReady(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateReady(w);
        });
      });
      // Check for updates when the app comes back to the front, and every half hour.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    })
    .catch(() => {});
}

// ---------- What's new ----------
// After an update, say so once and link to the change log in the menu.

export async function loadChangelog() {
  let entries = [];
  try {
    const r = await fetch('changelog.json');
    if (r.ok) entries = await r.json();
  } catch {}
  if (!Array.isArray(entries) || !entries.length) return;
  renderChangelog(entries);
  const latest = entries[0].version;
  const seen = store.get('seenVersion', null);
  store.set('seenVersion', latest);
  if (!seen || seen === latest) return;
  $('#whatsnew-text').textContent = `Updated to ${latest}.`;
  showBar('#whatsnew-bar', true);
  const hide = () => showBar('#whatsnew-bar', false);
  $('#whatsnew-yes').onclick = () => {
    hide();
    openSheet('#changelog');
  };
  $('#whatsnew-no').onclick = hide;
  setTimeout(hide, 30000);
}

// ---------- Offline ----------

function renderOnline() {
  showBar('#offline-bar', !navigator.onLine);
}
window.addEventListener('offline', renderOnline);
window.addEventListener('online', () => {
  renderOnline();
  refreshTabs();
  for (const t of state.tiles) {
    if (!t.player) mountTile(t);
    else if (t.player.reconnect) t.player.reconnect();
  }
});
renderOnline();

// ---------- Restore multi-view ----------
// If the last session ended in multi-view, offer to bring it back.

export function offerRestore(now = false) {
  const saved = (store.get('lastMulti', []) || [])
    .map((k) => parseSource(k))
    .filter(Boolean)
    .slice(0, MAX_TILES);
  if (saved.length < 2) return;
  // The home-screen shortcut: straight back into the last multi-view.
  if (now) {
    state.current = saved[0];
    setTiles(saved);
    return;
  }
  $('#restore-text').textContent = `Restore your multi-view (${saved.length} streams)?`;
  showBar('#restore-bar', true);
  const hide = () => showBar('#restore-bar', false);
  $('#restore-yes').onclick = () => {
    hide();
    state.current = saved[0];
    setTiles(saved);
  };
  $('#restore-no').onclick = () => {
    store.set('lastMulti', null);
    hide();
  };
  setTimeout(hide, 20000);
}
