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
  resumeOnLock: true,
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
let addMode = false; // the next tab tap adds a stream to multi-view instead of switching
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

const OWN_START_TIMEOUT_MS = 12000;

// Chrome on Android pauses any video when the page goes to the background,
// but lets audio-only playback continue. Kick streams have no audio-only
// version, so this hls.js instance drops the video track before it reaches
// the browser, which then sees an audio-only stream.
function makeAudioOnlyHls(config) {
  const h = new Hls(config);
  const trigger = h.trigger.bind(h);
  // Forget that fragments had video, so hls.js doesn't wait for video
  // buffering that will never happen before loading the next one.
  const dropVideo = (data) => {
    for (const f of [data && data.frag, data && data.part]) {
      if (f && f.elementaryStreams && f.elementaryStreams.video) f.elementaryStreams.video = null;
    }
  };
  h.trigger = (event, data) => {
    if (event === Hls.Events.BUFFER_CODECS && data && data.video) {
      const rest = { ...data };
      delete rest.video;
      return Object.keys(rest).length ? trigger(event, rest) : false;
    }
    if (event === Hls.Events.BUFFER_APPENDING && data && data.type === 'video') {
      dropVideo(data);
      return false;
    }
    if (event === Hls.Events.FRAG_PARSED) dropVideo(data);
    return trigger(event, data);
  };
  return h;
}

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
  // Let the browser pop it out on its own when you leave the app, where supported.
  v.autoPictureInPicture = true;
  v.setAttribute('autopictureinpicture', '');
  tile.body.appendChild(v);

  // hls.js plays the stream through Media Source in the page. Chrome's
  // built-in HLS support can't play these playlists, so it's only the
  // fallback for browsers without Media Source (older iPhones).
  let hls = null;
  const hasMse = !!(window.MediaSource || window.ManagedMediaSource);
  if (hasMse) {
    await loadScript(HLS_JS);
    if (!window.Hls || !Hls.isSupported()) { v.remove(); throw new Error('no HLS support'); }
    hls = new Hls({ liveSyncDurationCount: 3 });
    let recoveries = 0;
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (recoveries++ >= 3) return giveUp();
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else setTimeout(() => hls && hls.loadSource(url), 2000);
    });
    hls.loadSource(url);
    hls.attachMedia(v);
  } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
    v.src = url;
  } else {
    v.remove();
    throw new Error('no HLS support');
  }

  // If it hasn't started in a few seconds, go back to the site's own player.
  let started = false;
  let gaveUp = false;
  function giveUp() {
    if (started || gaveUp) return;
    gaveUp = true;
    tile.ownFailed = true;
    // Still loading (no player yet) or still this player: swap to the embed.
    if (tiles.includes(tile) && (!tile.player || tile.player.video === v)) mountTile(tile);
  }
  const timer = setTimeout(giveUp, OWN_START_TIMEOUT_MS);
  v.addEventListener('error', giveUp);
  v.addEventListener('playing', () => {
    started = true;
    clearTimeout(timer);
    onPlaying(tile);
    updateMediaSession();
  });
  v.addEventListener('pause', () => onPaused(tile));
  v.play().catch(() => {});

  // While the page is hidden (screen locked, another app open), play the
  // sound from an audio-only copy of the stream, then go back to the video.
  let bg = null; // { audio, hls }
  let playingAtHide = false; // the stream was playing with sound when the page was hidden
  let userPausedAt = 0; // last pause from the user (lock screen or picture-in-picture controls)

  function enterBackground() {
    if (bg || !hls || !started || v.muted || !playingAtHide || !document.hidden) return;
    if (!settings.resumeOnLock || Date.now() - userPausedAt < 1500) return;
    if (!current || key(current) !== key(tile.src)) return;
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    const h2 = makeAudioOnlyHls({ liveSyncDurationCount: 3 });
    h2.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) leaveBackground(); });
    h2.loadSource(url);
    h2.attachMedia(audio);
    audio.play().catch(() => {});
    bg = { audio, hls: h2 };
    hls.stopLoad();
    v.pause();
  }
  function leaveBackground() {
    if (!bg) return;
    const { audio, hls: h2 } = bg;
    bg = null;
    h2.destroy();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (hls) {
      hls.startLoad(-1);
      if (hls.liveSyncPosition) v.currentTime = hls.liveSyncPosition;
    }
    v.play().catch(() => {});
  }

  // Chrome on Android pauses the video when the page is hidden (screen
  // locked, another app open), and again when the screen locks while the
  // video is in picture-in-picture. Whenever that happens, carry on with the
  // audio-only copy. A video that keeps playing (in picture-in-picture, or on
  // desktop) is left alone.
  let hideTimer = null;
  function onVisibility() {
    clearTimeout(hideTimer);
    if (document.hidden) {
      playingAtHide = !v.paused && !v.muted;
      // Fallback in case the browser pauses without telling us right away.
      hideTimer = setTimeout(() => { if (v.paused) enterBackground(); }, 700);
    } else {
      leaveBackground();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);
  v.addEventListener('pause', () => {
    if (document.hidden && !bg) setTimeout(enterBackground, 0);
  });

  return {
    video: v,
    url,
    usesHls: () => !!hls,
    inBackground: () => !!bg,
    play() {
      if (bg) bg.audio.play().catch(() => {});
      else v.play().catch(() => {});
    },
    pause() {
      userPausedAt = Date.now();
      if (bg) bg.audio.pause();
      else v.pause();
    },
    setMuted(m) {
      v.muted = m;
      if (!m) v.play().catch(() => {});
    },
    unmute() { this.setMuted(false); },
    // Casting needs a plain URL on the element, so hand the stream over to it.
    castSource() {
      if (hls) { hls.destroy(); hls = null; }
      v.src = url;
    },
    destroy() {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(hideTimer);
      if (bg) { bg.hls.destroy(); bg.audio.pause(); bg = null; }
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
    navigator.mediaSession.setActionHandler('pause', () => {
      const p = tile()?.player;
      if (p?.pause) p.pause();
      else p?.video?.pause();
    });
  } catch {}
  // Chrome calls this to pop the playing video out automatically when you switch away.
  try {
    navigator.mediaSession.setActionHandler('enterpictureinpicture', () => {
      const v = tile()?.player?.video;
      if (v && document.pictureInPictureEnabled && !document.pictureInPictureElement) v.requestPictureInPicture().catch(() => {});
    });
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
    if (settings.ownPlayer && OWN_PLAYER_TYPES.has(tile.src.type) && !tile.ownFailed) {
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
      if (docPip && docPip.tile === t) docPip.win.close();
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
  document.body.classList.toggle('multi', tiles.length > 1);
  $('#multi-btn').setAttribute('aria-pressed', String(addMode));
  const label = tiles.length > 1 ? `${tiles.length} streams` : current ? streamName(current) : 'Better DGG Pro';
  document.title = current ? `${tiles.length > 1 ? label : streamName(current)} · Better DGG Pro` : 'Better DGG Pro';
  const hash = tiles.map((t) => key(t.src)).join(',');
  history.replaceState(null, '', hash ? '#' + hash : location.pathname);
  renderTabs();
  updateWakeLock();
  updateMediaSession();
  renderPip();
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

// Tapping a stream switches the one you're watching (the one with sound).
// To watch several at once, add them: grid button then a tab, or press and
// hold a tab.
function watch(src, { add = false } = {}) {
  if (OPEN_ON_DGG.has(src.type)) {
    window.open('https://www.destiny.gg/bigscreen#' + key(src), '_blank', 'noopener');
    return;
  }
  const list = tiles.map((t) => t.src);
  const inGrid = list.some((s) => key(s) === key(src));
  if (add || addMode) {
    setAddMode(false);
    if (inGrid) { setAudio(src); return; }
    if (list.length >= MAX_TILES) {
      toast(`Multi-view holds up to ${MAX_TILES} streams. Remove one first.`);
      return;
    }
    if (!list.length) { current = src; store.set('last', src); }
    setTiles([...list, src]);
    return;
  }
  if (inGrid) {
    if (list.length > 1) setAudio(src);
    return;
  }
  const i = list.findIndex((s) => current && key(s) === key(current));
  if (i >= 0) list[i] = src;
  else list.splice(0, list.length, src);
  current = src;
  store.set('last', src);
  setTiles(list);
}

function setAddMode(on) {
  addMode = on;
  $('#multi-btn').setAttribute('aria-pressed', String(on));
  if (on) toast(`Tap a stream below to add it to multi-view (up to ${MAX_TILES})`);
}

// ---------- Picture-in-picture ----------
// Videos the app plays itself (Kick) use the standard picture-in-picture
// API. Other sites' players are iframes the app can't reach into; on
// desktop Chrome and Edge the whole player can move into a Document
// Picture-in-Picture window instead (it reloads when it moves).

let docPip = null; // { win, tile, placeholder }

function soundTile() {
  return tiles.find((t) => current && key(t.src) === key(current)) || null;
}

function canVideoPip(v) {
  return !!v && ((document.pictureInPictureEnabled && v.requestPictureInPicture) ||
    (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')));
}

function pipAvailable() {
  const t = soundTile();
  if (!t) return false;
  return canVideoPip(t.player && t.player.video) || 'documentPictureInPicture' in window;
}

function renderPip() {
  $('#pip-btn').hidden = !pipAvailable();
  $('#pip-btn').textContent = document.pictureInPictureElement || docPip ? 'Exit picture-in-picture' : 'Picture-in-picture';
}

async function togglePip() {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture().catch(() => {});
    return;
  }
  if (docPip) { docPip.win.close(); return; }
  const t = soundTile();
  if (!t) return;
  const v = t.player && t.player.video;
  if (v && document.pictureInPictureEnabled && v.requestPictureInPicture) {
    try {
      if (v.paused) await v.play().catch(() => {});
      await v.requestPictureInPicture();
    } catch {
      toast("Couldn't start picture-in-picture");
    }
    return;
  }
  if (v && v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')) {
    v.webkitSetPresentationMode('picture-in-picture');
    return;
  }
  if ('documentPictureInPicture' in window) {
    openDocPip(t);
    return;
  }
  toast("Picture-in-picture works here for Kick streams. For other streams, use the player's own button if it has one.");
}

async function openDocPip(t) {
  let win;
  try {
    win = await documentPictureInPicture.requestWindow({ width: 480, height: 270 });
  } catch {
    toast("Couldn't start picture-in-picture");
    return;
  }
  const style = win.document.createElement('style');
  style.textContent = 'html,body{margin:0;height:100%;background:#000;overflow:hidden}' +
    '.tile-body,.tile-body>*,.tile-body iframe,.tile-body video{position:absolute;inset:0;width:100%!important;height:100%!important;border:0}' +
    'video{object-fit:contain;background:#000}';
  win.document.head.appendChild(style);
  win.document.title = streamName(t.src);
  const placeholder = document.createElement('div');
  placeholder.className = 'tile-body pip-placeholder';
  placeholder.textContent = 'Playing in picture-in-picture';
  t.el.insertBefore(placeholder, t.body);
  win.document.body.appendChild(t.body);
  docPip = { win, tile: t, placeholder };
  renderPip();
  win.addEventListener('pagehide', () => {
    if (!docPip || docPip.win !== win) return;
    placeholder.replaceWith(t.body);
    docPip = null;
    renderPip();
    // Players built with the YouTube and Twitch scripts lose their connection
    // when they move, so start them fresh back in the page.
    if (tiles.includes(t) && !(t.player && t.player.video)) mountTile(t);
  });
}

$('#pip-btn').addEventListener('click', () => {
  $('#sheet').close();
  togglePip();
});
document.addEventListener('enterpictureinpicture', renderPip, true);
document.addEventListener('leavepictureinpicture', renderPip, true);

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
  // The app paused the video itself to play the audio-only copy.
  if (tile.player && tile.player.inBackground && tile.player.inBackground()) return;
  if (!document.hidden) {
    tile.wantPlaying = false;
    return;
  }
  // The app's own player handles the background itself (audio-only copy).
  if (tile.player && tile.player.video) return;
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

function renderAwake() {}

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
  layoutTiles();
}

function openSheet() {
  $('#opt-awake').checked = settings.keepAwake;
  $('#opt-chat').checked = settings.showChat;
  $('#opt-own').checked = settings.ownPlayer;
  $('#sheet').showModal();
}

$('#menu-btn').addEventListener('click', openSheet);

$('#opt-awake').addEventListener('change', (e) => {
  saveSetting('keepAwake', e.target.checked);
  updateWakeLock();
});
$('#opt-chat').addEventListener('change', (e) => {
  saveSetting('showChat', e.target.checked);
  renderChat();
});
$('#opt-own').addEventListener('change', (e) => {
  saveSetting('ownPlayer', e.target.checked);
  for (const t of tiles) if (OWN_PLAYER_TYPES.has(t.src.type)) mountTile(t);
});

$('#multi-btn').addEventListener('click', () => {
  $('#sheet').close();
  setAddMode(true);
});

// Reloads everything, picking up a new version of the app if there is one.
$('#refresh-btn').addEventListener('click', () => location.reload());

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
  current = list[0];
  setTiles(list);
});

// ---------- Live embed tabs ----------
// The server relays destiny.gg's live list of embeds (the channel tabs under
// the bigscreen player). Shown as a scrolling row of tabs under the player.

// Small one-color platform marks, like the tabs on destiny.gg's bigscreen.
const PLATFORM_ICONS = {
  kick: 'M4 3h5v5h2V6h2V4h2V3h5v6h-2v2h-2v2h2v2h2v6h-5v-1h-2v-2h-2v-2H9v5H4z',
  twitch: 'M5 3 3.5 6.5V19h4v2.5H10l2.5-2.5h3.5l4.5-4.5V3zm13.5 10.5-2.5 2.5h-4L9.5 18.5V16H6V5h12.5zM15 7.5h2v5h-2zm-5 0h2v5h-2z',
  youtube: 'M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z',
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
let tabItems = [];

function renderTabs() {
  const nav = $('#tabs');
  const buttons = tabItems.map((item) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.title = [item.name, item.title].filter(Boolean).join(' · ');
    if (tiles.some((t) => key(t.src) === key(item.src))) b.setAttribute('aria-current', 'true');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.name;
    b.append(platformIcon(item.src.type), name);
    let held = false;
    let holdTimer = null;
    b.addEventListener('pointerdown', () => {
      held = false;
      holdTimer = setTimeout(() => { held = true; watch(item.src, { add: true }); }, 550);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(holdTimer));
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!held) watch(item.src, { add: true });
      held = true;
    });
    b.addEventListener('click', () => {
      if (held) { held = false; return; }
      watch(item.src);
    });
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

function castableTile() {
  const t = tiles.find((x) => current && key(x.src) === key(current));
  return t && t.player && t.player.video && t.player.video.remote ? t : null;
}

$('#cast-now').addEventListener('click', () => {
  const t = castableTile();
  if (!t) return;
  const p = t.player;
  const hadHls = p.usesHls();
  if (hadHls) p.castSource();
  p.video.remote.prompt().catch((err) => {
    toast(err && err.name === 'NotFoundError' ? 'No Chromecast found on this network' : "Couldn't start casting");
    if (hadHls) mountTile(t);
  });
});

$('#cast-btn').addEventListener('click', () => {
  $('#cast-now').hidden = !castableTile();
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
// A bar under the header offers to install the app. Chrome and Edge get a
// one-tap install; iPhones and in-app browsers get instructions instead.

let installPrompt = null;
const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function installSnoozed() {
  return Date.now() - store.get('installDismissedAt', 0) < INSTALL_SNOOZE_MS;
}

function showInstallBar(text, withButton) {
  if (standalone || installSnoozed()) return;
  $('#install-text').textContent = text;
  $('#install-yes').hidden = !withButton;
  $('#install-bar').hidden = false;
  layoutTiles();
}

function hideInstallBar() {
  $('#install-bar').hidden = true;
  layoutTiles();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#install-btn').hidden = false;
  showInstallBar('Install Better DGG Pro for full screen and quick access', true);
});

async function runInstall() {
  if (!installPrompt) return;
  installPrompt.prompt();
  const choice = await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  $('#install-btn').hidden = true;
  hideInstallBar();
  if (choice && choice.outcome === 'dismissed') store.set('installDismissedAt', Date.now());
}

$('#install-yes').addEventListener('click', runInstall);
$('#install-btn').addEventListener('click', runInstall);
$('#install-no').addEventListener('click', () => {
  store.set('installDismissedAt', Date.now());
  hideInstallBar();
});
window.addEventListener('appinstalled', hideInstallBar);

// No install prompt from the browser: explain how instead.
setTimeout(() => {
  if (installPrompt || standalone) return;
  if (isIOS) showInstallBar('Install: tap Share, then Add to Home Screen', false);
  else if (isAndroid) showInstallBar('Install: in Chrome, tap ⋮ then Add to home screen', false);
}, 3000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------- Start ----------

renderChat();
renderAwake();
startTabs();
const fromHash = parseHashList(location.hash);
const last = store.get('last', null);
const first = fromHash.length ? fromHash : [(last && last.type && validate(last)) || DEFAULT_SOURCE];
current = first[0];
setTiles(first);
