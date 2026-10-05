// Live embed tabs. The server relays destiny.gg's live list of embeds (the
// channel tabs under the bigscreen player), shown as a scrolling row of tabs
// under the player. Each update fires a 'livelist' event on document.

import { key, liveItems } from './sources.js';
import { state, knownNames, streamName } from './state.js';
import { $, store, toast, isTouch } from './util.js';
import { watch, renderTileNames, prepare, cancelPrepare } from './stage.js';

// Small one-color platform marks, like the tabs on destiny.gg's bigscreen.
const PLATFORM_ICONS = {
  kick: 'M4 3h5v5h2V6h2V4h2V3h5v6h-2v2h-2v2h2v2h2v6h-5v-1h-2v-2h-2v-2H9v5H4z',
  twitch:
    'M5 3 3.5 6.5V19h4v2.5H10l2.5-2.5h3.5l4.5-4.5V3zm13.5 10.5-2.5 2.5h-4L9.5 18.5V16H6V5h12.5zM15 7.5h2v5h-2zm-5 0h2v5h-2z',
  youtube:
    'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z',
  angelthump: 'M10 3h4l6.5 18h-4.4l-1.3-4H9.2l-1.3 4H3.5zm-.1 10.5h4.2L12 7z',
  rumble: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-2 5 6 4-6 4z',
};
PLATFORM_ICONS['twitch-vod'] = PLATFORM_ICONS['twitch-clip'] = PLATFORM_ICONS.twitch;
PLATFORM_ICONS['youtube-live'] = PLATFORM_ICONS.youtube;
PLATFORM_ICONS['kick-vod'] = PLATFORM_ICONS.kick;

function platformIcon(type) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('platform-icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', PLATFORM_ICONS[type] || PLATFORM_ICONS.rumble);
  svg.appendChild(path);
  return svg;
}

// Tabs are reused between updates so a scroll or long-press in progress
// isn't interrupted, and the row only scrolls to the selected tab when the
// selection changes.
let tabButtons = new Map(); // key -> button
let lastSelection = '';

function makeTabButton(src) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tab';
  const name = document.createElement('span');
  name.className = 'name';
  b.append(platformIcon(src.type), name);
  let held = false;
  let pressed = false;
  let holdTimer = null;
  b.addEventListener('pointerdown', (e) => {
    held = false;
    pressed = true;
    // Start loading right away; the click (or a long-press) decides what happens to it.
    if (e.button === 0) prepare(src);
    holdTimer = setTimeout(() => {
      if (held) return; // contextmenu got there first
      held = true;
      cancelPrepare();
      watch(src, { add: true });
    }, 550);
  });
  b.addEventListener('pointerup', () => {
    pressed = false;
    clearTimeout(holdTimer);
  });
  // Scrolling the row, or sliding off the tab while pressing, isn't a tap.
  // (Touch also "leaves" right after lifting the finger, before the click.)
  b.addEventListener('pointercancel', () => {
    pressed = false;
    clearTimeout(holdTimer);
    cancelPrepare();
  });
  b.addEventListener('pointerleave', () => {
    if (!pressed) return;
    pressed = false;
    clearTimeout(holdTimer);
    if (!held) cancelPrepare();
  });
  // Android fires this at its own long-press time, usually before the timer.
  b.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    clearTimeout(holdTimer);
    cancelPrepare();
    if (!held) watch(src, { add: true });
    held = true;
  });
  b.addEventListener('click', () => {
    if (held) {
      held = false;
      return;
    }
    watch(src);
  });
  return b;
}

export function renderTabs() {
  const nav = $('#tabs');
  // A stream on screen that dropped out of the live list keeps a dimmed tab
  // at the front, so it's still shown as selected.
  const listed = new Set(state.tabItems.map((i) => key(i.src)));
  const offline = state.tiles
    .filter((t) => !listed.has(key(t.src)))
    .map((t) => ({ src: t.src, name: streamName(t.src), title: 'Not in the live list right now', offline: true }));
  const items = [...offline, ...state.tabItems];
  const next = new Map();
  items.forEach((item, i) => {
    const k = key(item.src);
    const b = tabButtons.get(k) || makeTabButton(item.src);
    b.querySelector('.name').textContent = item.name;
    b.title = [item.name, item.title].filter(Boolean).join(' · ');
    b.classList.toggle('offline', !!item.offline);
    if (state.tiles.some((t) => key(t.src) === k)) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
    if (nav.children[i] !== b) nav.insertBefore(b, nav.children[i] || null);
    next.set(k, b);
  });
  while (nav.children.length > items.length) nav.lastElementChild.remove();
  tabButtons = next;

  const selection = state.tiles.map((t) => key(t.src)).join(',');
  if (selection !== lastSelection) {
    lastSelection = selection;
    // Scroll only the row sideways; scrollIntoView would also nudge the page,
    // since the tabs' tap area reaches past the bottom of the screen.
    const selected = nav.querySelector('[aria-current="true"]');
    if (selected) {
      const row = nav.getBoundingClientRect();
      const tab = selected.getBoundingClientRect();
      if (tab.left < row.left) nav.scrollLeft += tab.left - row.left - 8;
      else if (tab.right > row.right) nav.scrollLeft += tab.right - row.right + 8;
    }
  }
  if (items.length > 1) maybeShowHint();
}

// Long-press is invisible until someone mentions it, so say it once.
let hintTimer = null;
function maybeShowHint() {
  // Wait until the ⋮ tip has had its turn, so the two don't overlap.
  if (hintTimer || store.get('holdHintShown', false) || !store.get('menuTipShown', false)) return;
  if (!$('#menu-tip').hidden) return;
  hintTimer = setTimeout(() => {
    store.set('holdHintShown', true);
    toast(
      isTouch ? 'Tip: press and hold a tab to add it to multi-view' : 'Tip: right-click a tab to add it to multi-view',
      6000,
    );
  }, 2500);
}

export function applyLive(data) {
  const items = liveItems(data);
  for (const i of items) knownNames.set(key(i.src), i.name);
  state.tabItems = items;
  $('#tabs').classList.add('loaded'); // no more placeholder tabs, even if the list is empty
  renderTabs();
  renderTileNames();
  document.dispatchEvent(new CustomEvent('livelist'));
}

// A request that hangs (a dead connection the phone hasn't noticed yet) is
// cut off, so the next try can use a fresh one.
export async function refreshTabs() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch('api/embeds', { cache: 'no-store', signal: ctrl.signal });
    if (res.ok) {
      applyLive(await res.json());
      lastFreshAt = Date.now();
    }
  } catch {
  } finally {
    clearTimeout(timer);
  }
}

// The server pushes the list the moment destiny.gg changes it, and sends a
// ping every 25 s in between. EventSource reconnects by itself when it
// notices a drop, but a phone switching networks (Wi-Fi to cellular) can
// leave it with a dead connection it believes is open: nothing arrives and
// nothing errors. So the list is also polled when nothing has arrived for a
// while, and the connection is replaced when it has gone quiet.
let lastLiveAt = 0; // last message or ping on the live connection
let lastFreshAt = 0; // last time the list came from anywhere
const STALE_MS = 60000;
export function startTabs() {
  refreshTabs();
  if ('EventSource' in window) openLive();
  setInterval(() => {
    if (document.hidden) return;
    const now = Date.now();
    if (now - lastLiveAt > STALE_MS && now - lastFreshAt > 25000) refreshTabs();
    if (source && now - lastLiveAt > STALE_MS * 2) reopenLive();
  }, 15000);
}
// EventSource reconnects by itself after a dropped connection, but gives up
// for good when the server answers with an error (a restart, or too many
// connections from one place). Open a new one after a pause in that case.
let liveBackoff = 2000;
let source = null;
function openLive() {
  const es = new EventSource('api/live');
  source = es;
  es.onopen = () => {
    lastLiveAt = Date.now();
  };
  es.onmessage = (e) => {
    lastLiveAt = lastFreshAt = Date.now();
    liveBackoff = 2000;
    try {
      applyLive(JSON.parse(e.data));
    } catch {}
  };
  es.addEventListener('ping', () => {
    lastLiveAt = Date.now();
  });
  es.onerror = () => {
    if (es.readyState !== EventSource.CLOSED || source !== es) return;
    source = null;
    setTimeout(openLive, liveBackoff);
    liveBackoff = Math.min(liveBackoff * 2, 60000);
  };
}
function reopenLive() {
  if (!('EventSource' in window)) return;
  if (source) source.close();
  source = null;
  lastLiveAt = Date.now(); // give the new connection its own grace period
  openLive();
}
// Back on screen, or back online: fetch the list now, and replace a live
// connection that has gone quiet in the meantime.
function wakeUp() {
  refreshTabs();
  if (source && Date.now() - lastLiveAt > STALE_MS) reopenLive();
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) wakeUp();
});
window.addEventListener('online', wakeUp);

// Mouse wheels scroll the tab row sideways on desktop.
$('#tabs').addEventListener(
  'wheel',
  (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      $('#tabs').scrollBy({ left: e.deltaY });
    }
  },
  { passive: false },
);
