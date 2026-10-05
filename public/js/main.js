// DGG Remix: startup. The other modules:
//   util.js     settings, toast, device checks
//   sources.js  stream links and the live list (no DOM; unit tested)
//   state.js    what's on screen
//   stage.js    tiles, sound, layout, lock screen, wake lock
//   players.js  YouTube, Twitch, iframe and the app's own Kick player
//   tabs.js     the live embed tabs
//   chat.js     chat and its resizer
//   pip.js      picture-in-picture
//   menu.js     the ⋮ action row, settings sheet, change log, cast and install
//   bars.js     update, what's new, offline and restore bars

import { DEFAULT_SOURCE, key, parseHashList, parseSource, validate } from './sources.js';
import { state } from './state.js';
import { settings, store, standalone, isTouch, wasReloaded, saveSetting } from './util.js';
import { setTiles, layoutTiles, watch, stepStream, setAddMode, soundTile } from './stage.js';
import { HLS_JS, hasMse, loadScript } from './players.js';
import { startTabs } from './tabs.js';
import { renderChat, loadChat } from './chat.js';
import { maybeShowMenuTip } from './menu.js';
import { registerServiceWorker, loadChangelog, offerRestore } from './bars.js';

// Open what a shared link asks for. Otherwise wait briefly for the live list
// and open the last stream watched if it's live, then Destiny, then the first
// tab, so the app doesn't open on a stream that has ended.
function start() {
  if (!state.startPending) return;
  state.startPending = false;
  const saved = store.get('last', null);
  const last = saved && saved.type ? validate(saved) : null;
  const live = state.tabItems;
  const pick =
    (last && live.find((i) => key(i.src) === key(last))?.src) ||
    live.find((i) => i.destiny)?.src ||
    live[0]?.src ||
    last ||
    DEFAULT_SOURCE;
  state.current = pick;
  setTiles([pick]);
  offerRestore(restoreNow);
}
document.addEventListener('livelist', start);

window.addEventListener('hashchange', () => {
  const list = parseHashList(location.hash);
  if (!list.length || list.map(key).join(',') === state.tiles.map((t) => key(t.src)).join(',')) return;
  state.current = list[0];
  setTiles(list);
});

renderChat();
// Fetch the player library while the app works out what to play.
if (settings.ownPlayer && hasMse()) loadScript(HLS_JS).catch(() => {});
setTimeout(loadChat, 4000);
// The home-screen "Multi-view" shortcut (?restore=1) brings the last
// multi-view straight back; a shared link (?url= or ?text=, the manifest's
// share target) opens the stream it points at. Either way the address is
// cleaned up so a reload doesn't repeat it.
const params = new URLSearchParams(location.search);
const restoreNow = params.get('restore') === '1';
if (params.has('url') || params.has('text')) {
  const shared = [params.get('url'), params.get('text'), params.get('title')].filter(Boolean).join(' ');
  const found = shared.match(/https?:\/\/\S+/g) || [];
  const src = [...found, shared.trim()].map((x) => parseSource(x)).find(Boolean);
  if (src) location.hash = key(src);
}
if (location.search) history.replaceState(null, '', location.pathname + location.hash);
const fromHash = parseHashList(location.hash);
if (fromHash.length) {
  state.current = fromHash[0];
  setTiles(fromHash);
} else {
  state.startPending = true;
  setTimeout(start, 2000);
}
startTabs();
registerServiceWorker();
// Point out the ⋮ menu once the first stream has had a moment to start.
setTimeout(maybeShowMenuTip, 3000);
loadChangelog();

// ---------- Android's navigation buttons ----------
// The installed app on Android 15+ draws under the navigation buttons after
// an in-app reload (Refresh, or an update), and Chrome then reports their
// height as 0 through env(safe-area-inset-bottom), so the chat box ended up
// under the buttons. Two ways to know their height without trusting that:
//   1. whenever Chrome does report a height, remember it (per orientation);
//   2. remember how tall the window is on a normal launch from the icon. After
//      a reload, a window that is suddenly taller by a button-bar's worth is
//      drawing under the buttons, and the difference is their height.
// Whenever Chrome reports 0, pad with whichever of those we have, or with
// Android's standard 48 px after a reload when neither exists yet. A window
// that is no taller than at launch gets what Chrome reported then (nothing,
// as a rule): padding it anyway left an empty band above the buttons.
if (standalone) {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:-9999px;height:0;padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(probe);
  const MONTH = 30 * 24 * 60 * 60 * 1000;
  const orientation = () => (matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait');
  const insetKey = () => `navInset:${orientation()}`;
  const launchKey = () => `launchHeight:${orientation()}`;
  const nav = performance.getEntriesByType('navigation')[0];
  const freshLaunch = (!nav || nav.type === 'navigate') && !wasReloaded;
  const fresh = (v) => v && Date.now() - v.at < MONTH;

  const reportedInset = () => parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  // A normal launch: note the window height and what Chrome reported, so a
  // reload can be compared to it.
  function recordLaunchHeight() {
    if (!freshLaunch || document.hidden) return;
    store.set(launchKey(), { h: window.innerHeight, screen: screen.height, inset: reportedInset(), at: Date.now() });
  }

  // What the buttons are worth after a reload, judged from the window
  // height: the extra height over a normal launch, or, when the window is no
  // taller, whatever Chrome reported at that launch (usually 0: the window
  // ends above the buttons, as it did then). Null when no launch is known.
  function heightFromLaunch() {
    const saved = store.get(launchKey(), null);
    if (!fresh(saved) || saved.screen !== screen.height) return null;
    const extra = window.innerHeight - saved.h;
    if (extra >= 8 && extra <= 160) return extra;
    return Math.abs(extra) < 8 ? saved.inset || 0 : null;
  }
  // Without a launch to compare to: a window that stops short of the screen
  // by more than a status bar's worth has the buttons outside it.
  const buttonsOutside = () => screen.height - window.innerHeight >= 56;

  const checkInsets = () => {
    const reported = reportedInset();
    const root = document.documentElement.style;
    if (reported > 0) {
      store.set(insetKey(), { px: reported, at: Date.now() });
      root.removeProperty('--nav-fallback');
    } else {
      const fromLaunch = heightFromLaunch();
      const saved = store.get(insetKey(), null);
      // Nothing measured yet (the first reload after installing): pad the
      // usual height rather than nothing, unless the window plainly ends
      // above the buttons. Android's button bar is 48 px; a tablet's taskbar
      // is taller. (Chrome on Android tablets calls itself a desktop browser,
      // so this goes by touch, not by the Android name.)
      const tablet = Math.min(screen.width, screen.height) >= 600;
      const floor = isTouch && !freshLaunch && !buttonsOutside() ? (tablet ? 64 : 48) : 0;
      const px = fromLaunch ?? (fresh(saved) && saved.px > 0 && !buttonsOutside() ? saved.px : floor);
      if (px > 0) root.setProperty('--nav-fallback', px + 'px');
      else root.removeProperty('--nav-fallback');
    }
    layoutTiles();
  };
  checkInsets();
  for (const ms of [300, 1000, 3000]) {
    setTimeout(() => {
      recordLaunchHeight();
      checkInsets();
    }, ms);
  }
  window.addEventListener('resize', checkInsets);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkInsets();
  });
}

// ---------- Keyboard shortcuts (desktop) ----------
// 1–9 switch to that tab, ← → previous/next, M add to multi-view, C chat,
// F fullscreen on the stream with the sound, P picture-in-picture. Ignored
// while typing (chat is its own frame and never sees these).
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (document.querySelector('dialog[open]')) return;
  const k = e.key;
  if (k >= '1' && k <= '9') {
    const item = state.tabItems[Number(k) - 1];
    if (item) watch(item.src);
  } else if (k === 'ArrowRight') stepStream(1);
  else if (k === 'ArrowLeft') stepStream(-1);
  else if (k === 'm' || k === 'M') setAddMode(!state.addMode);
  else if (k === 'c' || k === 'C') {
    saveSetting('showChat', !settings.showChat);
    renderChat();
    loadChat();
  } else if (k === 'f' || k === 'F') {
    const el = soundTile()?.el;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el?.requestFullscreen?.();
  } else if (k === 'p' || k === 'P') {
    const b = document.getElementById('pip-btn');
    if (b && !b.hidden) b.click();
  } else return;
  e.preventDefault();
});

// For tests and debugging in the browser console.
window.dggRemix = { state, key };
