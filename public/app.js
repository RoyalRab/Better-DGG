'use strict';

const $ = (sel) => document.querySelector(sel);

// ---------- Settings ----------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('bdgg:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('bdgg:' + key, JSON.stringify(value)); } catch {}
  },
};

const settings = {
  keepAwake: store.get('keepAwake', true),
  resumeOnLock: store.get('resumeOnLock', true),
  ownPlayer: store.get('ownPlayer', true),
  showChat: store.get('showChat', true),
};

function saveSetting(key, value) {
  settings[key] = value;
  store.set(key, value);
}

// ---------- Toast ----------

let toastTimer;
function toast(msg, ms = 2500) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- Source parsing ----------
// A source is { type, id } using DGG's bigscreen platform names, e.g.
// { type: 'kick', id: 'destiny' } for #kick/destiny. Accepts those hash links
// and normal platform links.

const DEFAULT_SOURCE = { type: 'kick', id: 'destiny' };
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const DIGITS = /^\d{1,20}$/;
const PLATFORM_NAMES = {
  kick: 'Kick',
  'kick-vod': 'Kick VOD',
  twitch: 'Twitch',
  'twitch-vod': 'Twitch VOD',
  'twitch-clip': 'Twitch clip',
  youtube: 'YouTube',
  'youtube-live': 'YouTube live',
  rumble: 'Rumble',
  vimeo: 'Vimeo',
  angelthump: 'AngelThump',
  facebook: 'Facebook',
};
// Platforms this app can't play itself; picking one opens destiny.gg's bigscreen.
const OPEN_ON_DGG = new Set(['kick-vod', 'facebook']);

function parseSource(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  s = s.replace(/^#/, '');

  const hash = s.match(/^([a-z-]+)\/(.+)$/i);
  if (hash && PLATFORM_NAMES[hash[1].toLowerCase()]) {
    const type = hash[1].toLowerCase();
    let id = hash[2];
    let t = null;
    if (type === 'rumble') {
      id = id.replace(/\/?(\?.*)?$/, '');
    } else {
      const m = id.match(/^(.*?)\?t=(\d+)s?$/);
      if (m) { id = m[1]; t = Number(m[2]); }
    }
    return validate({ type, id, t });
  }

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
  } catch { return null; }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  const t = Number(String(url.searchParams.get('t') || '').replace(/s$/, '')) || null;

  if (host === 'kick.com' || host === 'player.kick.com') {
    if (parts[1] === 'videos' && parts[2]) return validate({ type: 'kick-vod', id: `${parts[0]}/videos/${parts[2]}` });
    return parts[0] ? validate({ type: 'kick', id: parts[0] }) : null;
  }
  if (host === 'clips.twitch.tv') {
    return validate({ type: 'twitch-clip', id: url.searchParams.get('clip') || parts[0] || '' });
  }
  if (host === 'twitch.tv' || host === 'player.twitch.tv') {
    if (parts[0] === 'videos' && parts[1]) return validate({ type: 'twitch-vod', id: parts[1] });
    if (parts[1] === 'clip' && parts[2]) return validate({ type: 'twitch-clip', id: parts[2] });
    if (url.searchParams.get('video')) return validate({ type: 'twitch-vod', id: url.searchParams.get('video').replace(/^v/, '') });
    const id = url.searchParams.get('channel') || parts[0];
    return id ? validate({ type: 'twitch', id }) : null;
  }
  if (host === 'youtu.be') {
    return parts[0] ? validate({ type: 'youtube', id: parts[0], t }) : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v) return validate({ type: 'youtube', id: v, t });
    if (['live', 'embed', 'shorts', 'v'].includes(parts[0]) && parts[1]) {
      if (parts[1] === 'live_stream' && url.searchParams.get('channel')) {
        return validate({ type: 'youtube-live', id: url.searchParams.get('channel') });
      }
      return validate({ type: 'youtube', id: parts[1], t });
    }
    return null;
  }
  if (host === 'rumble.com' && parts[0] === 'embed' && parts[1]) {
    return validate({ type: 'rumble', id: parts[1] });
  }
  if ((host === 'vimeo.com' || host === 'player.vimeo.com') && parts.length) {
    const id = parts[parts.length - 1];
    return validate({ type: 'vimeo', id });
  }
  if (host === 'angelthump.com' && parts[0]) {
    return validate({ type: 'angelthump', id: parts[0] });
  }
  return null;
}

function validate(src) {
  const out = { type: src.type, id: src.id };
  if (src.t && (src.type === 'youtube' || src.type === 'twitch-vod')) out.t = src.t;
  switch (src.type) {
    case 'youtube':
      return YT_ID.test(src.id) ? out : null;
    case 'kick':
    case 'twitch':
    case 'angelthump':
      if (!NAME.test(src.id)) return null;
      out.id = src.id.toLowerCase();
      return out;
    case 'twitch-vod':
    case 'vimeo':
      return DIGITS.test(src.id) ? out : null;
    case 'kick-vod':
      return /^[\w-]{1,64}\/(videos\/)?[\w-]{1,64}$/.test(src.id) ? out : null;
    default:
      return NAME.test(src.id) ? out : null;
  }
}

const key = (src) => `${src.type}/${src.id}`;

// ---------- Players ----------
// The stage shows one stream, or up to four in multi-view. Each one is a
// "tile". YouTube and Twitch are loaded through their JS APIs so we can mute
// them and see when they pause; the rest are plain iframes.

const MAX_TILES = 4;
const SPEAKER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
let tiles = []; // { src, el, body, player, token, wantPlaying }
let current = null; // the stream with sound (the only one in single view)
let multi = store.get('multi', false);
let started = false; // false until the first tap, so streams can start with sound

const scripts = {};
function loadScript(src) {
  scripts[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { delete scripts[src]; reject(new Error('Could not load ' + src)); };
    document.head.appendChild(s);
  });
  return scripts[src];
}

let ytReady;
function loadYouTubeApi() {
  ytReady ||= new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(); };
    loadScript('https://www.youtube.com/iframe_api').catch((e) => { ytReady = null; reject(e); });
  });
  return ytReady;
}

function frameUrl(src, muted) {
  const id = encodeURIComponent(src.id);
  const parent = encodeURIComponent(location.hostname);
  switch (src.type) {
    case 'twitch-clip': return `https://clips.twitch.tv/embed?clip=${id}&parent=${parent}&autoplay=true&muted=${muted}`;
    case 'youtube-live': return `https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&playsinline=1&mute=${muted ? 1 : 0}`;
    case 'kick': return `https://player.kick.com/${id}?autoplay=true&muted=${muted}`;
    case 'rumble': return `https://rumble.com/embed/${id}/`;
    case 'vimeo': return `https://player.vimeo.com/video/${id}?autoplay=1&muted=${muted ? 1 : 0}`;
    case 'angelthump': return `https://player.angelthump.com/?channel=${id}`;
    default: return null;
  }
}
// Plain iframes whose URL can ask for muted playback; the others can't be muted from outside.
const FRAME_CAN_MUTE = new Set(['twitch-clip', 'youtube-live', 'kick', 'vimeo']);

function mountFrame(tile, muted) {
  const f = document.createElement('iframe');
  f.src = frameUrl(tile.src, muted);
  f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
  f.allowFullscreen = true;
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  tile.body.appendChild(f);
  return {
    muted,
    play() {},
    // A plain iframe can only change sound by reloading with a different URL.
    setMuted(m) {
      if (m === this.muted || (m && !FRAME_CAN_MUTE.has(tile.src.type))) return;
      this.muted = m;
      f.src = frameUrl(tile.src, m);
    },
    // Players that start muted because of autoplay rules need a reload after a tap.
    unmute() {
      this.muted = false;
      f.src = frameUrl(tile.src, false);
    },
    destroy() { f.remove(); },
  };
}

async function mountYouTube(tile, muted) {
  await loadYouTubeApi();
  const holder = document.createElement('div');
  holder.id = 'yt-' + Math.random().toString(36).slice(2);
  tile.body.appendChild(holder);
  const yt = new YT.Player(holder, {
    videoId: tile.src.id,
    playerVars: { autoplay: 1, playsinline: 1, rel: 0, mute: muted ? 1 : 0, ...(tile.src.t ? { start: tile.src.t } : {}) },
    events: {
      onStateChange(e) {
        if (e.data === YT.PlayerState.PLAYING) onPlaying(tile);
        else if (e.data === YT.PlayerState.PAUSED) onPaused(tile);
      },
    },
  });
  return {
    play() { try { yt.playVideo(); } catch {} },
    setMuted(m) {
      try {
        if (m) yt.mute();
        else { yt.unMute(); yt.setVolume(100); yt.playVideo(); }
      } catch {}
    },
    unmute() { this.setMuted(false); },
    destroy() {
      try { yt.destroy(); } catch {}
      const el = document.getElementById(holder.id);
      if (el) el.remove();
    },
  };
}

async function mountTwitch(tile, muted) {
  await loadScript('https://player.twitch.tv/js/embed/v1.js');
  const holder = document.createElement('div');
  holder.id = 'tw-' + Math.random().toString(36).slice(2);
  tile.body.appendChild(holder);
  const what = tile.src.type === 'twitch-vod'
    ? { video: tile.src.id, ...(tile.src.t ? { time: `${tile.src.t}s` } : {}) }
    : { channel: tile.src.id };
  const tw = new Twitch.Player(holder.id, {
    ...what,
    width: '100%',
    height: '100%',
    autoplay: true,
    muted,
    parent: [location.hostname],
  });
  tw.addEventListener(Twitch.Player.PLAYING, () => onPlaying(tile));
  tw.addEventListener(Twitch.Player.PAUSE, () => onPaused(tile));
  return {
    play() { try { tw.play(); } catch {} },
    setMuted(m) {
      try {
        tw.setMuted(m);
        if (!m) { tw.setVolume(1); tw.play(); }
      } catch {}
    },
    unmute() { this.setMuted(false); },
    destroy() { holder.remove(); },
  };
}

// Kick streams can play in the app's own <video>, which keeps sound going
// when the phone locks, shows lock screen controls, and can be cast.
const HLS_JS = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
const OWN_PLAYER_TYPES = new Set(['kick']);

async function mountOwn(tile, muted) {
  const url = new URL(`api/stream/${tile.src.type}/${encodeURIComponent(tile.src.id)}.m3u8`, location.href).toString();
  const check = await fetch(url, { cache: 'no-store' });
  if (!check.ok) throw new Error('not playable: ' + check.status);

  const v = document.createElement('video');
  v.className = 'own-player';
  v.controls = true;
  v.autoplay = true;
  v.playsInline = true;
  v.muted = muted;
  v.setAttribute('playsinline', '');
  tile.body.appendChild(v);

  let hls = null;
  if (v.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS (Safari, Chrome on Android): the plain URL can also be cast.
    v.src = url;
  } else {
    await loadScript(HLS_JS);
    if (!window.Hls || !Hls.isSupported()) { v.remove(); throw new Error('no HLS support'); }
    hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3 });
    let recoveries = 0;
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (recoveries++ > 3) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else setTimeout(() => hls && hls.loadSource(url), 2000);
    });
    hls.loadSource(url);
    hls.attachMedia(v);
  }
  v.addEventListener('playing', () => { onPlaying(tile); updateMediaSession(); });
  v.addEventListener('pause', () => onPaused(tile));
  v.play().catch(() => {});
  return {
    video: v,
    play() { v.play().catch(() => {}); },
    setMuted(m) {
      v.muted = m;
      if (!m) v.play().catch(() => {});
    },
    unmute() { this.setMuted(false); },
    destroy() {
      if (hls) { hls.destroy(); hls = null; }
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    },
  };
}

// Lock screen and notification controls for the stream with sound.
function updateMediaSession() {
  if (!('mediaSession' in navigator) || !current) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: streamName(current),
    artist: PLATFORM_NAMES[current.type] || current.type,
    album: 'Better DGG Pro',
    artwork: [{ src: new URL('icons/icon-512.png', location.href).toString(), sizes: '512x512', type: 'image/png' }],
  });
  const tile = () => tiles.find((t) => key(t.src) === key(current));
  try {
    navigator.mediaSession.setActionHandler('play', () => tile()?.player?.play());
    navigator.mediaSession.setActionHandler('pause', () => tile()?.player?.video?.pause());
  } catch {}
}

async function mountTile(tile) {
  const token = (tile.token = (tile.token || 0) + 1);
  if (tile.player) tile.player.destroy();
  tile.player = null;
  tile.wantPlaying = false;
  tile.body.replaceChildren();
  const muted = !current || key(current) !== key(tile.src);
  let mounted;
  try {
    if (settings.ownPlayer && OWN_PLAYER_TYPES.has(tile.src.type)) {
      try { mounted = await mountOwn(tile, muted); } catch { mounted = null; }
      if (token !== tile.token) { mounted?.destroy(); return; }
    }
    if (mounted) { /* own player */ }
    else if (tile.src.type === 'youtube') mounted = await mountYouTube(tile, muted);
    else if (tile.src.type === 'twitch' || tile.src.type === 'twitch-vod') mounted = await mountTwitch(tile, muted);
    else if (frameUrl(tile.src, muted)) mounted = mountFrame(tile, muted);
    else throw new Error('Unsupported platform ' + tile.src.type);
  } catch {
    if (token !== tile.token) return;
    const msg = document.createElement('div');
    msg.className = 'empty';
    msg.textContent = 'Could not load the player. Check your connection and try again.';
    tile.body.replaceChildren(msg);
    return;
  }
  // The tile was removed or reloaded while this player was loading.
  if (token !== tile.token || !tiles.includes(tile)) { mounted.destroy(); return; }
  tile.player = mounted;
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
  close.setAttribute('aria-label', 'Remove from multi-view');
  close.textContent = '✕';
  bar.append(sound, name, close);
  el.append(body, bar);
  const tile = { src, el, body, player: null, token: 0, wantPlaying: false };
  sound.addEventListener('click', () => setAudio(tile.src));
  close.addEventListener('click', () => removeTile(tile.src));
  return tile;
}

function streamName(src) {
  const item = tabItems.find((t) => key(t.src) === key(src));
  return item ? item.name : src.id;
}

// Rebuild the stage from `want` (a list of sources), keeping players that stay.
function setTiles(want) {
  const keep = new Map(tiles.map((t) => [key(t.src), t]));
  const next = want.map((src) => keep.get(key(src)) || makeTile(src));
  for (const t of tiles) {
    if (!next.includes(t)) {
      t.token++;
      if (t.player) t.player.destroy();
      t.el.remove();
    }
  }
  tiles = next;
  if (!current || !tiles.some((t) => key(t.src) === key(current))) current = tiles[0] ? tiles[0].src : null;

  const stage = $('#player');
  stage.querySelector('.tap-to-play')?.remove();
  stage.dataset.count = String(tiles.length);
  tiles.forEach((t, i) => {
    if (stage.children[i] !== t.el) stage.insertBefore(t.el, stage.children[i] || null);
  });
  layoutTiles();

  if (!started && !hasTapped()) showTapToPlay();
  else {
    started = true;
    for (const t of tiles) if (!t.player && !t.token) mountTile(t);
  }
  renderStage();
}

function renderStage() {
  for (const t of tiles) {
    const hasSound = current && key(t.src) === key(current);
    t.el.querySelector('.tile-name').textContent = streamName(t.src);
    const sound = t.el.querySelector('.tile-sound');
    sound.setAttribute('aria-pressed', String(!!hasSound));
    sound.setAttribute('aria-label', hasSound ? 'This stream has the sound' : 'Play sound from this stream');
    t.el.classList.toggle('has-sound', !!hasSound);
  }
  document.body.classList.toggle('multi', multi);
  $('#multi-btn').setAttribute('aria-pressed', String(multi));
  const label = tiles.length > 1 ? `${tiles.length} streams` : current ? streamName(current) : 'Better DGG Pro';
  $('#source-label').textContent = label;
  document.title = current ? `${tiles.length > 1 ? label : streamName(current)} · Better DGG Pro` : 'Better DGG Pro';
  const hash = tiles.map((t) => key(t.src)).join(',');
  history.replaceState(null, '', hash ? '#' + hash : location.pathname);
  renderTabs();
  updateWakeLock();
  updateMediaSession();
}

function hasTapped() {
  return !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
}

function showTapToPlay() {
  const stage = $('#player');
  stage.querySelector('.tap-to-play')?.remove();
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tap-to-play';
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span></span>';
  b.querySelector('span').textContent = tiles.length > 1 ? `Tap to play ${tiles.length} streams` : `Tap to play ${streamName(current)}`;
  b.addEventListener('click', () => {
    started = true;
    b.remove();
    for (const t of tiles) if (!t.player) mountTile(t);
  });
  stage.appendChild(b);
}

// Pick the grid that gives each 16:9 stream the most room. Portrait phones
// use fixed stacks from the stylesheet instead, since their height follows width.
function layoutTiles() {
  const stage = $('#player');
  const n = tiles.length;
  stage.style.removeProperty('--cols');
  if (n < 2 || !isRowLayout()) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  let best = 1;
  let bestArea = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const tw = w / cols;
    const th = h / rows;
    const vw = Math.min(tw, (th * 16) / 9);
    if (vw * (vw * 9) / 16 > bestArea + 1) { bestArea = vw * (vw * 9) / 16; best = cols; }
  }
  stage.style.setProperty('--cols', String(best));
}
const rowLayoutQuery = window.matchMedia('(orientation: landscape) and (min-aspect-ratio: 4/3), (min-width: 1000px) and (min-aspect-ratio: 1/1)');
const isRowLayout = () => rowLayoutQuery.matches;
if ('ResizeObserver' in window) new ResizeObserver(() => layoutTiles()).observe($('#player'));

function setAudio(src) {
  current = src;
  for (const t of tiles) {
    if (t.player) t.player.setMuted(key(t.src) !== key(src));
  }
  store.set('last', src);
  renderStage();
}

function removeTile(src) {
  const rest = tiles.filter((t) => key(t.src) !== key(src)).map((t) => t.src);
  if (current && key(current) === key(src) && rest.length) setAudio(rest[0]);
  setTiles(rest);
}

function watch(src) {
  if (OPEN_ON_DGG.has(src.type)) {
    window.open('https://www.destiny.gg/bigscreen#' + key(src), '_blank', 'noopener');
    return;
  }
  const inGrid = tiles.some((t) => key(t.src) === key(src));
  if (!multi) {
    if (inGrid && tiles.length === 1) return;
    current = src;
    store.set('last', src);
    setTiles([src]);
    return;
  }
  // Multi-view: tapping a stream adds it, tapping it again removes it.
  if (inGrid) {
    if (tiles.length > 1) removeTile(src);
    return;
  }
  if (tiles.length >= MAX_TILES) {
    toast(`Multi-view holds up to ${MAX_TILES} streams. Remove one first.`);
    return;
  }
  if (!tiles.length) { current = src; store.set('last', src); }
  setTiles([...tiles.map((t) => t.src), src]);
}

function setMulti(on) {
  multi = on;
  store.set('multi', on);
  if (!on && tiles.length > 1) setTiles([current || tiles[0].src]);
  else renderStage();
  toast(on ? 'Multi-view on: tap streams below to add up to 4' : 'Multi-view off');
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
}

function onPaused(tile) {
  if (!document.hidden) {
    tile.wantPlaying = false;
    return;
  }
  const since = hiddenAt ? Date.now() - hiddenAt : 0;
  if (settings.resumeOnLock && tile.wantPlaying && tile.player &&
      since < RESUME_WINDOW_MS && resumesThisLock < MAX_RESUMES_PER_LOCK * MAX_TILES) {
    resumesThisLock++;
    setTimeout(() => tile.player && tile.player.play(), 300);
  }
}

// ---------- Screen wake lock ----------

let wakeLock = null;

async function updateWakeLock() {
  const want = settings.keepAwake && current && document.visibilityState === 'visible';
  if (want && !wakeLock && 'wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; renderAwake(); });
    } catch {
      wakeLock = null;
    }
  } else if (!want && wakeLock) {
    try { await wakeLock.release(); } catch {}
    wakeLock = null;
  }
  renderAwake();
}

function renderAwake() {
  $('#awake-btn').setAttribute('aria-pressed', String(!!wakeLock));
  $('#awake-btn').title = wakeLock ? 'Screen will stay on' : 'Screen can sleep';
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
document.addEventListener('pointerdown', () => { if (!wakeLock) updateWakeLock(); }, { passive: true });

// ---------- UI ----------

function renderChat() {
  document.body.classList.toggle('no-chat', !settings.showChat);
  $('#chat-btn').setAttribute('aria-pressed', String(settings.showChat));
}

function openSheet() {
  $('#opt-awake').checked = settings.keepAwake;
  $('#opt-resume').checked = settings.resumeOnLock;
  $('#opt-own').checked = settings.ownPlayer;
  $('#sheet').showModal();
}

$('#menu-btn').addEventListener('click', openSheet);

$('#opt-awake').addEventListener('change', (e) => {
  saveSetting('keepAwake', e.target.checked);
  updateWakeLock();
});
$('#opt-resume').addEventListener('change', (e) => saveSetting('resumeOnLock', e.target.checked));
$('#opt-own').addEventListener('change', (e) => {
  saveSetting('ownPlayer', e.target.checked);
  for (const t of tiles) if (OWN_PLAYER_TYPES.has(t.src.type)) mountTile(t);
});

$('#awake-btn').addEventListener('click', () => {
  saveSetting('keepAwake', !settings.keepAwake);
  updateWakeLock().then(() => {
    if (!('wakeLock' in navigator)) toast("This browser can't keep the screen on");
    else toast(settings.keepAwake ? 'Screen will stay on' : 'Screen can sleep normally');
  });
});

$('#sound-btn').addEventListener('click', () => {
  if (!current) return;
  const tap = $('#player .tap-to-play');
  if (tap) return tap.click();
  const tile = tiles.find((t) => key(t.src) === key(current));
  if (!tile) return;
  if (tile.player) tile.player.unmute();
  else mountTile(tile);
});

$('#multi-btn').addEventListener('click', () => setMulti(!multi));

$('#chat-btn').addEventListener('click', () => {
  saveSetting('showChat', !settings.showChat);
  renderChat();
});

$('#reload-chat').addEventListener('click', () => {
  const f = $('#chat-frame');
  f.src = f.src;
  $('#sheet').close();
});

// The hash lists what's on screen, e.g. #kick/destiny or #kick/a,twitch/b for multi-view.
function parseHashList(hash) {
  const list = [];
  for (const part of hash.replace(/^#/, '').split(',')) {
    const src = parseSource(part);
    if (src && !OPEN_ON_DGG.has(src.type) && !list.some((s) => key(s) === key(src))) list.push(src);
  }
  return list.slice(0, MAX_TILES);
}

window.addEventListener('hashchange', () => {
  const list = parseHashList(location.hash);
  if (!list.length || list.map(key).join(',') === tiles.map((t) => key(t.src)).join(',')) return;
  if (list.length > 1 && !multi) { multi = true; store.set('multi', true); }
  current = list[0];
  setTiles(multi ? list : [list[0]]);
});

// ---------- Live embed tabs ----------
// The server relays destiny.gg's live list of embeds (the channel tabs under
// the bigscreen player). Shown as a scrolling row of tabs under the player.

const BADGE_LETTERS = {
  kick: 'K', twitch: 'T', 'twitch-vod': 'T', 'twitch-clip': 'T', youtube: 'Y', 'youtube-live': 'Y',
  rumble: 'R', angelthump: 'A', vimeo: 'V', facebook: 'F', 'kick-vod': 'K', destiny: 'D',
};
let tabItems = [];

function formatViewers(n) {
  if (n == null) return '';
  return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n);
}

function renderTabs() {
  const nav = $('#tabs');
  const buttons = tabItems.map((item) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.title = [item.name, item.title].filter(Boolean).join(' · ');
    if (tiles.some((t) => key(t.src) === key(item.src))) b.setAttribute('aria-current', 'true');
    const badge = document.createElement('span');
    badge.className = 'badge ' + item.badge;
    badge.textContent = BADGE_LETTERS[item.badge] || '?';
    badge.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.name;
    b.append(badge, name);
    if (item.viewers != null) {
      const v = document.createElement('span');
      v.className = 'viewers';
      v.textContent = formatViewers(item.viewers);
      v.setAttribute('aria-label', `${item.viewers} watching`);
      b.appendChild(v);
    }
    b.addEventListener('click', () => watch(item.src));
    return b;
  });
  nav.replaceChildren(...buttons);
  const selected = nav.querySelector('[aria-current="true"]');
  if (selected) selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function applyLive(data) {
  const items = [];
  for (const d of data.destiny || []) {
    let src = null;
    if (d.platform === 'kick') src = { type: 'kick', id: 'destiny' };
    else if (d.platform === 'youtube' && d.id) src = parseSource(`youtube/${d.id}`);
    else if (d.platform === 'rumble' && d.id) src = parseSource(`rumble/${d.id}`);
    if (src) items.push({ src, badge: 'destiny', name: `Destiny (${PLATFORM_NAMES[d.platform] || d.platform})`, title: d.title, viewers: d.viewers });
  }
  for (const e of data.embeds || []) {
    const src = parseSource(`${e.platform}/${e.id}`);
    if (!src || items.some((i) => key(i.src) === key(src))) continue;
    items.push({ src, badge: src.type, name: e.name || src.id, title: e.title, viewers: e.viewers });
  }
  tabItems = items;
  if (tiles.length) renderStage();
  else renderTabs();
}

async function refreshTabs() {
  try {
    const res = await fetch('api/embeds', { cache: 'no-store' });
    if (res.ok) applyLive(await res.json());
  } catch {}
}

// The server pushes the list the moment destiny.gg changes it. EventSource
// reconnects by itself; polling covers browsers or networks where it fails.
let liveSource = null;
let lastLiveAt = 0;
function startTabs() {
  refreshTabs();
  if ('EventSource' in window) {
    liveSource = new EventSource('api/live');
    liveSource.onmessage = (e) => {
      lastLiveAt = Date.now();
      try { applyLive(JSON.parse(e.data)); } catch {}
    };
    liveSource.addEventListener('ping', () => { lastLiveAt = Date.now(); });
  }
  setInterval(() => {
    if (!document.hidden && Date.now() - lastLiveAt > 60000) refreshTabs();
  }, 30000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshTabs(); });

// Mouse wheels scroll the tab row sideways on desktop.
$('#tabs').addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    $('#tabs').scrollBy({ left: e.deltaY });
  }
}, { passive: false });

// ---------- Cast to TV ----------

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);

function castSteps() {
  const steps = [];
  if (isAndroid) {
    steps.push(['Whole screen, with chat', 'Swipe down for quick settings and tap Smart View (Samsung) or Screen cast, then pick your TV.']);
  } else if (isIOS) {
    steps.push(['Whole screen, with chat', 'Open Control Center, tap Screen Mirroring and pick an AirPlay TV. Chromecast doesn\'t support AirPlay.']);
  } else {
    steps.push(['This tab, with chat', 'In Chrome or Edge, open the ⋮ menu, choose Cast, save, and share, then Cast…, set Sources to Cast tab and pick your TV.']);
  }
  steps.push(['Just the video', 'If the player shows a cast icon (YouTube and Twitch often do), tap it to send only the stream to your Chromecast.']);
  return steps;
}

function castableVideo() {
  const t = tiles.find((x) => current && key(x.src) === key(current));
  const v = t?.player?.video;
  return v && v.remote && v.src && !v.src.startsWith('blob:') ? v : null;
}

$('#cast-now').addEventListener('click', () => {
  const v = castableVideo();
  if (!v) return;
  v.remote.prompt().catch((err) => toast(err && err.name === 'NotFoundError' ? 'No Chromecast found on this network' : "Couldn't start casting"));
});

$('#cast-btn').addEventListener('click', () => {
  $('#cast-now').hidden = !castableVideo();
  const box = $('#cast-steps');
  box.replaceChildren(...castSteps().map(([title, text]) => {
    const p = document.createElement('p');
    const b = document.createElement('b');
    b.textContent = title + '. ';
    p.append(b, text);
    return p;
  }));
  $('#sheet').close();
  $('#cast-sheet').showModal();
});
$('#cast-close').addEventListener('click', () => $('#cast-sheet').close());

const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (isIOS && !standalone) $('#ios-install').hidden = false;

// ---------- Install ----------

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#install-btn').hidden = false;
});
$('#install-btn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#install-btn').hidden = true;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------- Start ----------

renderChat();
renderAwake();
startTabs();
const fromHash = parseHashList(location.hash);
const last = store.get('last', null);
if (fromHash.length > 1) { multi = true; store.set('multi', true); }
const first = fromHash.length ? fromHash : [(last && last.type && validate(last)) || DEFAULT_SOURCE];
current = first[0];
setTiles(multi ? first : [first[0]]);
