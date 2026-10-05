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

import { DEFAULT_SOURCE, key, parseHashList, validate } from './sources.js';
import { state } from './state.js';
import { settings, store, standalone } from './util.js';
import { setTiles, layoutTiles } from './stage.js';
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
  offerRestore();
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
// Whenever Chrome reports 0, pad with whichever of those we have.
if (standalone) {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:-9999px;height:0;padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(probe);
  const MONTH = 30 * 24 * 60 * 60 * 1000;
  const orientation = () => (matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait');
  const insetKey = () => `navInset:${orientation()}`;
  const launchKey = () => `launchHeight:${orientation()}`;
  const nav = performance.getEntriesByType('navigation')[0];
  const freshLaunch = !nav || nav.type === 'navigate';
  const fresh = (v) => v && Date.now() - v.at < MONTH;

  // A normal launch: note the window height, so a reload can be compared to it.
  function recordLaunchHeight() {
    if (!freshLaunch || document.hidden) return;
    store.set(launchKey(), { h: window.innerHeight, screen: screen.height, at: Date.now() });
  }

  // What the buttons are worth after a reload, judged from the window height.
  function heightFromLaunch() {
    const saved = store.get(launchKey(), null);
    if (!fresh(saved) || saved.screen !== screen.height) return 0;
    const extra = window.innerHeight - saved.h;
    return extra >= 8 && extra <= 160 ? extra : 0;
  }

  const checkInsets = () => {
    const reported = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    const root = document.documentElement.style;
    if (reported > 0) {
      store.set(insetKey(), { px: reported, at: Date.now() });
      root.removeProperty('--nav-fallback');
    } else {
      const fromLaunch = heightFromLaunch();
      const saved = store.get(insetKey(), null);
      const px = fromLaunch || (fresh(saved) && saved.px > 0 ? saved.px : 0);
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

// For tests and debugging in the browser console.
window.dggRemix = { state, key };
