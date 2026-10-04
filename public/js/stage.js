// The stage shows one stream, or up to four in multi-view. Each one is a
// "tile" with its own player (see players.js).

import { MAX_TILES, OPEN_ON_DGG, PLATFORM_NAMES, key } from './sources.js';
import { state, isCurrent, streamName } from './state.js';
import { $, settings, store, toast, announce, isRowLayout } from './util.js';
import {
  OWN_PLAYER_TYPES,
  canControlSound,
  frameUrl,
  mountFrame,
  mountOwn,
  mountTwitch,
  mountYouTube,
} from './players.js';
import { renderTabs } from './tabs.js';
import { renderPip, closeDocPipFor, inDocPip } from './pip.js';
import { loadChat } from './chat.js';

const SPEAKER_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';

// ---------- Sound before the first tap ----------
// Can players start with sound before the first tap? Chrome usually allows it
// in the installed app. Ask the browser if it can say, otherwise try a short
// silent clip.

const SILENT_WAV =
  'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
let soundAllowed = false;
const soundCheck = (async () => {
  try {
    if (navigator.getAutoplayPolicy) {
      soundAllowed = navigator.getAutoplayPolicy('mediaelement') === 'allowed';
      return;
    }
    const a = new Audio(SILENT_WAV);
    await Promise.race([a.play(), new Promise((_, reject) => setTimeout(reject, 1000))]);
    soundAllowed = true;
    a.pause();
  } catch {}
})();

const hasTapped = () => !!(navigator.userActivation && navigator.userActivation.hasBeenActive);

// Streams start on their own. Before the first tap, Chrome may not allow
// sound (installed apps usually are allowed). When it isn't, the stream plays
// muted with a "Tap for sound" button over it.
function renderSoundChip(tile) {
  tile.el.querySelector('.sound-chip').hidden = !tile.soundBlocked;
}

// ---------- Tiles ----------

const LOADING_MAX_MS = 20000;

function setLoading(tile, on) {
  clearTimeout(tile.loadingTimer);
  tile.el.classList.toggle('loading', on);
  if (on) tile.loadingTimer = setTimeout(() => tile.el.classList.remove('loading'), LOADING_MAX_MS);
}

export async function mountTile(tile) {
  const token = (tile.token = (tile.token || 0) + 1);
  await soundCheck;
  if (token !== tile.token) return;
  if (tile.player) tile.player.destroy();
  tile.player = null;
  tile.wantPlaying = false;
  tile.body.replaceChildren();
  setLoading(tile, true);
  // A tile loading ahead of a tap (see prepare) is about to have the sound.
  const wantSound = isCurrent(tile.src) || !!tile.prepared;
  // Other sites' players can't report blocked sound, so they start muted
  // until the first tap. The app's own player tries with sound and falls
  // back to muted if Chrome refuses.
  const muted = !wantSound || !(hasTapped() || soundAllowed);
  tile.soundBlocked = false;
  let mounted;
  try {
    if (settings.ownPlayer && OWN_PLAYER_TYPES.has(tile.src.type) && !tile.ownFailed) {
      try {
        mounted = await mountOwn(tile, !wantSound);
      } catch {
        mounted = null;
      }
      if (token !== tile.token) {
        mounted?.destroy();
        return;
      }
    }
    if (!mounted) tile.soundBlocked = wantSound && muted && canControlSound(tile.src);
    if (mounted) {
      // the app's own player
    } else if (tile.src.type === 'youtube') mounted = await mountYouTube(tile, muted);
    else if (tile.src.type === 'twitch' || tile.src.type === 'twitch-vod') mounted = await mountTwitch(tile, muted);
    else if (frameUrl(tile.src, muted)) mounted = mountFrame(tile, muted);
    else throw new Error('Unsupported platform ' + tile.src.type);
  } catch {
    if (token !== tile.token) return;
    setLoading(tile, false);
    const msg = document.createElement('div');
    msg.className = 'empty';
    const text = document.createElement('p');
    text.textContent = "Couldn't load the player. Check your connection.";
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'retry';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => mountTile(tile));
    msg.append(text, retry);
    tile.body.replaceChildren(msg);
    return;
  }
  // The tile was removed or reloaded while this player was loading.
  if (token !== tile.token || !(state.tiles.includes(tile) || tile.prepared)) {
    mounted.destroy();
    return;
  }
  tile.player = mounted;
  renderSoundChip(tile);
  renderPip();
}

function makeTile(src) {
  const el = document.createElement('div');
  el.className = 'tile';
  const body = document.createElement('div');
  body.className = 'tile-body';
  const bar = document.createElement('div');
  bar.className = 'tile-bar';
  const name = document.createElement('span');
  name.className = 'tile-name';
  const sound = document.createElement('button');
  sound.type = 'button';
  sound.className = 'tile-sound';
  sound.innerHTML = SPEAKER_SVG;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tile-close';
  close.textContent = '✕';
  bar.append(sound, name, close);
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'sound-chip';
  chip.hidden = true;
  chip.innerHTML = SPEAKER_SVG + '<span>Tap for sound</span>';
  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinner.setAttribute('role', 'progressbar');
  spinner.setAttribute('aria-label', 'Loading stream');
  el.append(body, spinner, bar, chip);
  const tile = { src, el, body, player: null, token: 0, wantPlaying: false, soundBlocked: false };
  tile.onLoaded = () => onLoaded(tile);
  tile.onPlaying = () => onPlaying(tile);
  tile.onPaused = () => onPaused(tile);
  tile.onSoundBlocked = () => {
    tile.soundBlocked = true;
    renderSoundChip(tile);
  };
  tile.remount = () => mountTile(tile);
  chip.addEventListener('click', () => {
    tile.soundBlocked = false;
    renderSoundChip(tile);
    if (!isCurrent(tile.src)) setAudio(tile.src);
    else if (tile.player) tile.player.unmute();
    else mountTile(tile);
  });
  sound.addEventListener('click', () => setAudio(tile.src));
  close.addEventListener('click', () => removeTile(tile.src));
  return tile;
}

function dropTile(t) {
  closeDocPipFor(t);
  t.token++;
  clearTimeout(t.loadingTimer);
  if (t.player) t.player.destroy();
  t.el.remove();
}

// ---------- Keep the last Kick stream warm ----------
// A Kick stream in the app's own player that you switch away from (or remove
// from multi-view) keeps playing hidden and muted for a minute, so switching
// back to it is instant. Only the last one is kept. Other sites' players
// can't be muted from outside, so they're closed as before.

const PARK_MS = 60000;
let parked = null; // { tile, timer }

const canPark = (t) => !!(t.player && t.player.video && t.wantPlaying && !inDocPip(t));

function retire(t) {
  if (canPark(t)) park(t);
  else dropTile(t);
}

function park(t) {
  dropParked();
  t.player.setMuted(true);
  t.el.classList.remove('leaving');
  t.el.classList.add('parked');
  t.el.setAttribute('aria-hidden', 'true');
  parked = { tile: t, timer: setTimeout(dropParked, PARK_MS) };
}

export function dropParked() {
  if (!parked) return;
  clearTimeout(parked.timer);
  const { tile } = parked;
  parked = null;
  dropTile(tile);
}

function takeParked(src) {
  if (!parked || key(parked.tile.src) !== key(src)) return null;
  clearTimeout(parked.timer);
  const { tile } = parked;
  parked = null;
  tile.el.classList.remove('parked');
  tile.el.removeAttribute('aria-hidden');
  tile.unparked = true;
  return tile;
}

// ---------- Start loading on press ----------
// A tab starts loading its stream the moment it's pressed, hidden behind the
// current one; the tap that follows takes it over. A scroll, a long-press, or
// no tap within 3 s throws it away.

let prepared = null; // { tile, timer }

export function prepare(src) {
  cancelPrepare();
  if (state.addMode || OPEN_ON_DGG.has(src.type) || state.tiles.some((t) => key(t.src) === key(src))) return;
  if (parked && key(parked.tile.src) === key(src)) return; // already running
  const tile = makeTile(src);
  tile.prepared = true;
  tile.el.classList.add('preparing');
  tile.el.setAttribute('aria-hidden', 'true');
  $('#player').appendChild(tile.el);
  prepared = { tile, timer: setTimeout(cancelPrepare, 3000) };
  mountTile(tile);
}

export function cancelPrepare() {
  if (!prepared) return;
  clearTimeout(prepared.timer);
  const { tile } = prepared;
  prepared = null;
  dropTile(tile);
}

function takePrepared(src) {
  if (!prepared || key(prepared.tile.src) !== key(src)) return null;
  clearTimeout(prepared.timer);
  const { tile } = prepared;
  prepared = null;
  tile.prepared = false;
  tile.el.classList.remove('preparing');
  tile.el.removeAttribute('aria-hidden');
  return tile;
}

// ---------- Switching without a black flash ----------
// When one stream replaces another, the old one stays on screen (on top)
// until the new one starts playing underneath, or for at most 10 s.

let handoff = null; // { old, next, timer }

function startHandoff(old, next) {
  old.el.classList.add('leaving');
  old.el.setAttribute('aria-hidden', 'true');
  handoff = { old, next, timer: setTimeout(finishHandoff, 10000) };
}

function finishHandoff() {
  if (!handoff) return;
  clearTimeout(handoff.timer);
  const { old } = handoff;
  handoff = null;
  retire(old);
}

function onLoaded(tile) {
  setLoading(tile, false);
  // Other sites' players don't all say when they start, so give them a moment.
  if (handoff && handoff.next === tile) {
    clearTimeout(handoff.timer);
    handoff.timer = setTimeout(finishHandoff, 1500);
  }
}

// Rebuild the stage from `want` (a list of sources), keeping players that stay.
export function setTiles(want) {
  state.startPending = false; // something was picked, so don't auto-pick at startup
  finishHandoff();
  const before = state.tiles;
  const keep = new Map(before.map((t) => [key(t.src), t]));
  const next = want.map((src) => keep.get(key(src)) || takeParked(src) || takePrepared(src) || makeTile(src));
  const removed = before.filter((t) => !next.includes(t));
  const swap =
    before.length === 1 &&
    next.length === 1 &&
    removed.length === 1 &&
    removed[0].player &&
    !inDocPip(removed[0]) &&
    !removed[0].el.classList.contains('loading') &&
    !(next[0].player && next[0].wantPlaying); // the new one is already playing (kept warm)
  for (const t of removed) {
    if (swap) startHandoff(t, next[0]);
    else retire(t);
  }
  state.tiles = next;
  if (!state.current || !next.some((t) => isCurrent(t.src))) state.current = next[0] ? next[0].src : null;
  // A stream coming back from being kept warm: sound back on if it's the one with sound.
  for (const t of next) {
    if (!t.unparked) continue;
    t.unparked = false;
    t.player.setMuted(!isCurrent(t.src));
    t.player.play();
  }

  const stage = $('#player');
  stage.dataset.count = String(next.length);
  next.forEach((t, i) => {
    if (stage.children[i] !== t.el) stage.insertBefore(t.el, stage.children[i] || null);
  });
  layoutTiles();

  for (const t of next) if (!t.player && !t.token) mountTile(t);
  cancelPrepare();
  renderStage();
}

// Names on the multi-view labels and in the page title.
export function renderTileNames() {
  for (const t of state.tiles) t.el.querySelector('.tile-name').textContent = streamName(t.src);
  const c = state.current;
  document.title = c
    ? `${state.tiles.length > 1 ? `${state.tiles.length} streams` : streamName(c)} · DGG Remix`
    : 'DGG Remix';
}

let announced = '';
export function renderStage() {
  renderTileNames();
  for (const t of state.tiles) {
    const hasSound = isCurrent(t.src);
    const name = streamName(t.src);
    const sound = t.el.querySelector('.tile-sound');
    sound.setAttribute('aria-pressed', String(hasSound));
    sound.setAttribute('aria-label', hasSound ? `${name} has the sound` : `Play sound from ${name}`);
    t.el.querySelector('.tile-close').setAttribute('aria-label', `Remove ${name} from multi-view`);
    t.el.classList.toggle('has-sound', hasSound);
  }
  document.body.classList.toggle('multi', state.tiles.length > 1);
  $('#multi-btn').setAttribute('aria-pressed', String(state.addMode));
  const hash = state.tiles.map((t) => key(t.src)).join(',');
  history.replaceState(null, '', hash ? '#' + hash : location.pathname);
  if (state.tiles.length > 1)
    store.set(
      'lastMulti',
      state.tiles.map((t) => key(t.src)),
    );
  const now = state.current ? `${key(state.current)}|${state.tiles.length}` : '';
  if (now && now !== announced) {
    announced = now;
    const name = streamName(state.current);
    announce(state.tiles.length > 1 ? `${state.tiles.length} streams. Sound from ${name}` : `Now watching ${name}`);
  }
  renderTabs();
  updateWakeLock();
  updateMediaSession();
  renderPip();
}

// Pick the grid that gives each 16:9 stream the most room. Portrait phones
// use fixed stacks from the stylesheet instead, since their height follows width.
export function layoutTiles() {
  const stage = $('#player');
  const n = state.tiles.length;
  stage.style.removeProperty('--cols');
  if (n < 2 || !isRowLayout()) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  let best = 1;
  let bestArea = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const vw = Math.min(w / cols, ((h / rows) * 16) / 9);
    const area = (vw * vw * 9) / 16;
    if (area > bestArea + 1) {
      bestArea = area;
      best = cols;
    }
  }
  stage.style.setProperty('--cols', String(best));
}
if ('ResizeObserver' in window) new ResizeObserver(() => layoutTiles()).observe($('#player'));

export function setAudio(src) {
  state.current = src;
  for (const t of state.tiles) {
    if (t.soundBlocked) {
      t.soundBlocked = false;
      renderSoundChip(t);
    }
  }
  for (const t of state.tiles) {
    if (t.player) t.player.setMuted(key(t.src) !== key(src));
  }
  store.set('last', src);
  renderStage();
}

export function removeTile(src) {
  const rest = state.tiles.filter((t) => key(t.src) !== key(src)).map((t) => t.src);
  if (isCurrent(src) && rest.length) setAudio(rest[0]);
  setTiles(rest);
}

// Tapping a stream switches the one you're watching (the one with sound).
// To watch several at once, add them: the menu's multi-view button then a
// tab, or press and hold a tab.
export function watch(src, { add = false } = {}) {
  if (OPEN_ON_DGG.has(src.type)) {
    window.open('https://www.destiny.gg/bigscreen#' + key(src), '_blank', 'noopener');
    return;
  }
  const list = state.tiles.map((t) => t.src);
  const inGrid = list.some((s) => key(s) === key(src));
  if (add || state.addMode) {
    setAddMode(false);
    if (inGrid) {
      setAudio(src);
      return;
    }
    if (list.length >= MAX_TILES) {
      toast(`Multi-view holds up to ${MAX_TILES} streams. Remove one first.`);
      return;
    }
    if (!list.length) {
      state.current = src;
      store.set('last', src);
    }
    setTiles([...list, src]);
    return;
  }
  if (inGrid) {
    if (list.length > 1) setAudio(src);
    return;
  }
  const i = list.findIndex((s) => isCurrent(s));
  if (i >= 0) list[i] = src;
  else list.splice(0, list.length, src);
  state.current = src;
  store.set('last', src);
  setTiles(list);
}

export function setAddMode(on) {
  state.addMode = on;
  $('#multi-btn').setAttribute('aria-pressed', String(on));
  if (on) toast(`Tap a stream below to add it to multi-view (up to ${MAX_TILES})`);
}

export const soundTile = () => state.tiles.find((t) => isCurrent(t.src)) || null;

// ---------- Lock screen controls ----------

export function updateMediaSession() {
  if (!('mediaSession' in navigator) || !state.current) return;
  const c = state.current;
  navigator.mediaSession.metadata = new window.MediaMetadata({
    title: streamName(c),
    artist: PLATFORM_NAMES[c.type] || c.type,
    album: 'DGG Remix',
    artwork: [{ src: new URL('icons/icon-512.png', location.href).toString(), sizes: '512x512', type: 'image/png' }],
  });
  try {
    navigator.mediaSession.setActionHandler('play', () => soundTile()?.player?.play());
    navigator.mediaSession.setActionHandler('pause', () => {
      const p = soundTile()?.player;
      if (p?.pause) p.pause();
      else p?.video?.pause();
    });
  } catch {}
  // Chrome calls this to pop the playing video out automatically when you switch away.
  try {
    navigator.mediaSession.setActionHandler('enterpictureinpicture', () => {
      const v = soundTile()?.player?.video;
      if (v && document.pictureInPictureEnabled && !document.pictureInPictureElement) {
        v.requestPictureInPicture().catch(() => {});
      }
    });
  } catch {}
}

// ---------- Keep playing when the screen locks ----------
// Some players pause themselves the moment the page is hidden. If a pause
// lands within a few seconds of the page being hidden, and the stream was
// playing, start it again. Pauses outside that window are treated as the
// user's choice (for example from the lock screen media controls).

let hiddenAt = 0;
let resumesThisLock = 0;
const RESUME_WINDOW_MS = 8000;
const MAX_RESUMES_PER_LOCK = 4;

function onPlaying(tile) {
  tile.wantPlaying = true;
  setLoading(tile, false);
  if (handoff && handoff.next === tile) finishHandoff();
  if (tile.player && tile.player.video) updateMediaSession();
  loadChat();
}

function onPaused(tile) {
  // The app paused the video itself to play the audio-only copy.
  if (tile.player && tile.player.inBackground && tile.player.inBackground()) return;
  if (!document.hidden) {
    tile.wantPlaying = false;
    return;
  }
  // The app's own player handles the background itself (audio-only copy).
  if (tile.player && tile.player.video) return;
  const since = hiddenAt ? Date.now() - hiddenAt : 0;
  if (
    settings.resumeOnLock &&
    tile.wantPlaying &&
    tile.player &&
    since < RESUME_WINDOW_MS &&
    resumesThisLock < MAX_RESUMES_PER_LOCK * MAX_TILES
  ) {
    resumesThisLock++;
    setTimeout(() => tile.player && tile.player.play(), 300);
  }
}

// ---------- Screen wake lock ----------

let wakeLock = null;

export async function updateWakeLock() {
  const want = settings.keepAwake && state.current && document.visibilityState === 'visible';
  if (want && !wakeLock && 'wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } catch {
      wakeLock = null;
    }
  } else if (!want && wakeLock) {
    try {
      await wakeLock.release();
    } catch {}
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    resumesThisLock = 0;
  } else {
    hiddenAt = 0;
    updateWakeLock();
  }
});
// Chrome can refuse the lock before the first tap; try again on interaction.
document.addEventListener(
  'pointerdown',
  () => {
    if (!wakeLock) updateWakeLock();
  },
  { passive: true },
);
