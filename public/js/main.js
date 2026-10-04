// DGG Remix: startup. The other modules:
//   util.js     settings, toast, device checks
//   sources.js  stream links and the live list (no DOM; unit tested)
//   state.js    what's on screen
//   stage.js    tiles, sound, layout, lock screen, wake lock
//   players.js  YouTube, Twitch, iframe and the app's own Kick player
//   tabs.js     the live embed tabs
//   chat.js     chat and its resizer
//   pip.js      picture-in-picture
//   menu.js     the ⚙ settings menu, change log, cast and install
//   bars.js     update, what's new, offline and restore bars

import { DEFAULT_SOURCE, key, parseHashList, validate } from './sources.js';
import { state } from './state.js';
import { settings, store } from './util.js';
import { setTiles } from './stage.js';
import { HLS_JS, hasMse, loadScript } from './players.js';
import { startTabs } from './tabs.js';
import { renderChat, loadChat } from './chat.js';
import './menu.js';
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
loadChangelog();

// For tests and debugging in the browser console.
window.dggRemix = { state, key };
