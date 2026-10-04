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
const OPEN_ON_DGG = new Set(['kick-vod', 'facebook', 'angelthump']);

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
      return /^[\w-]{1,64}\/videos\/[\w-]{1,64}$/.test(src.id) ? out : null;
    default:
      return NAME.test(src.id) ? out : null;
  }
}

const key = (src) => `${src.type}/${src.id}`;

// ---------- Players ----------
// YouTube and Twitch are loaded through their JS APIs so we can see when they
// pause and start them again. Kick and Rumble are plain iframes.

let player = null; // { play(), destroy() }
let current = null;
let mountToken = 0;

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

function mountFrame(src) {
  const f = document.createElement('iframe');
  f.src = src;
  f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
  f.allowFullscreen = true;
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  $('#player').appendChild(f);
  // No API to unmute a plain iframe; reloading it after a tap starts it with sound.
  return { play() {}, unmute() { remountCurrent(); }, destroy() { f.remove(); } };
}

async function mountYouTube(id, start) {
  await loadYouTubeApi();
  const holder = document.createElement('div');
  holder.id = 'yt-' + Date.now();
  $('#player').appendChild(holder);
  const yt = new YT.Player(holder, {
    videoId: id,
    playerVars: { autoplay: 1, playsinline: 1, rel: 0, ...(start ? { start } : {}) },
    events: {
      onStateChange(e) {
        if (e.data === YT.PlayerState.PLAYING) onPlaying();
        else if (e.data === YT.PlayerState.PAUSED) onPaused();
      },
    },
  });
  return {
    play() { try { yt.playVideo(); } catch {} },
    unmute() { try { yt.unMute(); yt.setVolume(100); yt.playVideo(); } catch {} },
    destroy() {
      try { yt.destroy(); } catch {}
      const el = document.getElementById(holder.id);
      if (el) el.remove();
    },
  };
}

async function mountTwitch(what) {
  await loadScript('https://player.twitch.tv/js/embed/v1.js');
  const holder = document.createElement('div');
  holder.id = 'twitch-' + Date.now();
  $('#player').appendChild(holder);
  const tw = new Twitch.Player(holder.id, {
    ...what,
    width: '100%',
    height: '100%',
    autoplay: true,
    muted: false,
    parent: [location.hostname],
  });
  tw.addEventListener(Twitch.Player.PLAYING, onPlaying);
  tw.addEventListener(Twitch.Player.PAUSE, onPaused);
  return {
    play() { try { tw.play(); } catch {} },
    unmute() { try { tw.setMuted(false); tw.setVolume(1); tw.play(); } catch {} },
    destroy() { holder.remove(); },
  };
}

function watch(src, { remember = true } = {}) {
  if (OPEN_ON_DGG.has(src.type)) {
    window.open('https://www.destiny.gg/bigscreen#' + key(src), '_blank', 'noopener');
    return;
  }
  if (current && key(current) === key(src) && player) return;
  current = src;
  $('#source-label').textContent = key(src);
  document.title = `${key(src)} · Better DGG`;
  history.replaceState(null, '', '#' + key(src));

  if (remember) {
    store.set('last', src);
    const recent = store.get('recent', []).filter((r) => key(r) !== key(src));
    recent.unshift(src);
    store.set('recent', recent.slice(0, 6));
  }

  // Chrome only lets a player start with sound after the user has tapped
  // something on the page. Until then, wait for a tap instead of starting muted.
  if (hasTapped()) mountCurrent();
  else showTapToPlay();
  updateWakeLock();
}

function hasTapped() {
  return !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
}

function clearPlayer() {
  if (player) player.destroy();
  player = null;
  wantPlaying = false;
  $('#player').replaceChildren();
}

function showTapToPlay() {
  clearPlayer();
  mountToken++;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tap-to-play';
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span></span>';
  b.querySelector('span').textContent = 'Tap to play ' + key(current);
  b.addEventListener('click', mountCurrent);
  $('#player').replaceChildren(b);
}

function remountCurrent() {
  if (!current) return;
  clearPlayer();
  mountCurrent();
}

async function mountCurrent() {
  const src = current;
  if (!src) return;
  clearPlayer();
  const token = ++mountToken;

  let mounted;
  try {
    const id = encodeURIComponent(src.id);
    const parent = encodeURIComponent(location.hostname);
    switch (src.type) {
      case 'youtube': mounted = await mountYouTube(src.id, src.t); break;
      case 'twitch': mounted = await mountTwitch({ channel: src.id }); break;
      case 'twitch-vod': mounted = await mountTwitch({ video: src.id, ...(src.t ? { time: `${src.t}s` } : {}) }); break;
      case 'twitch-clip': mounted = mountFrame(`https://clips.twitch.tv/embed?clip=${id}&parent=${parent}&autoplay=true`); break;
      case 'youtube-live': mounted = mountFrame(`https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&playsinline=1`); break;
      case 'kick': mounted = mountFrame(`https://player.kick.com/${id}?autoplay=true&muted=false`); break;
      case 'rumble': mounted = mountFrame(`https://rumble.com/embed/${id}/`); break;
      case 'vimeo': mounted = mountFrame(`https://player.vimeo.com/video/${id}?autoplay=1`); break;
      default: throw new Error('Unsupported platform ' + src.type);
    }
  } catch (err) {
    if (token !== mountToken) return;
    const msg = document.createElement('div');
    msg.className = 'empty';
    msg.textContent = 'Could not load the player. Check your connection and try again.';
    $('#player').replaceChildren(msg);
    return;
  }
  // Another stream was picked while this one was loading.
  if (token !== mountToken) { mounted.destroy(); return; }
  player = mounted;
}

// ---------- Keep playing when the screen locks ----------
// Some players pause themselves the moment the page is hidden. If a pause
// lands within a few seconds of the page being hidden, and the stream was
// playing, start it again. Pauses outside that window are treated as the
// user's choice (for example from the lock screen media controls).

let wantPlaying = false;
let hiddenAt = 0;
let resumesThisLock = 0;
const RESUME_WINDOW_MS = 8000;
const MAX_RESUMES_PER_LOCK = 4;

function onPlaying() {
  wantPlaying = true;
}

function onPaused() {
  if (!document.hidden) {
    wantPlaying = false;
    return;
  }
  const since = hiddenAt ? Date.now() - hiddenAt : 0;
  if (settings.resumeOnLock && wantPlaying && player &&
      since < RESUME_WINDOW_MS && resumesThisLock < MAX_RESUMES_PER_LOCK) {
    resumesThisLock++;
    setTimeout(() => player && player.play(), 300);
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

function renderRecent() {
  const box = $('#recent');
  box.replaceChildren();
  const list = store.get('recent', []);
  if (!list.some((r) => key(r) === key(DEFAULT_SOURCE))) list.push(DEFAULT_SOURCE);
  for (const src of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = key(src);
    b.addEventListener('click', () => { $('#sheet').close(); watch(src); });
    box.appendChild(b);
  }
}

function openSheet() {
  $('#source-input').value = '';
  $('#source-error').hidden = true;
  $('#opt-awake').checked = settings.keepAwake;
  $('#opt-resume').checked = settings.resumeOnLock;
  renderRecent();
  $('#sheet').showModal();
}

$('#source-btn').addEventListener('click', openSheet);
$('#menu-btn').addEventListener('click', openSheet);

$('#source-form').addEventListener('submit', (e) => {
  if (e.submitter && e.submitter.value === 'close') return;
  const raw = $('#source-input').value;
  if (!raw.trim()) return;
  const src = parseSource(raw);
  if (!src) {
    e.preventDefault();
    const err = $('#source-error');
    err.textContent = /rumble\.com\/v/i.test(raw)
      ? 'For Rumble, use the embed link (rumble.com/embed/…) or #rumble/ID from DGG chat.'
      : "That link isn't one I recognise. Try kick.com/name, a YouTube link, twitch.tv/name, or #kick/name.";
    err.hidden = false;
    return;
  }
  watch(src);
});

$('#opt-awake').addEventListener('change', (e) => {
  saveSetting('keepAwake', e.target.checked);
  updateWakeLock();
});
$('#opt-resume').addEventListener('change', (e) => saveSetting('resumeOnLock', e.target.checked));

$('#awake-btn').addEventListener('click', () => {
  saveSetting('keepAwake', !settings.keepAwake);
  updateWakeLock().then(() => {
    if (!('wakeLock' in navigator)) toast("This browser can't keep the screen on");
    else toast(settings.keepAwake ? 'Screen will stay on' : 'Screen can sleep normally');
  });
});

$('#sound-btn').addEventListener('click', () => {
  if (!current) return;
  if (!player) mountCurrent();
  else player.unmute();
});

$('#chat-btn').addEventListener('click', () => {
  saveSetting('showChat', !settings.showChat);
  renderChat();
});

$('#reload-chat').addEventListener('click', () => {
  const f = $('#chat-frame');
  f.src = f.src;
  $('#sheet').close();
});

window.addEventListener('hashchange', () => {
  const src = parseSource(location.hash);
  if (src) watch(src);
});

// ---------- Embed list ----------
// The server reads destiny.gg chat and counts the #platform/id embed links
// people post, like the list on destiny.gg's bigscreen.

let embedsMinutes = store.get('embedsMinutes', 30);
let embedsTimer = null;

function timeAgo(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function embedRow(src, name, meta, count) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  if (current && key(current) === key(src)) b.setAttribute('aria-current', 'true');
  const n = document.createElement('span');
  n.className = 'name';
  n.textContent = name;
  const m = document.createElement('span');
  m.className = 'meta';
  m.textContent = meta;
  b.append(n, m);
  if (count != null) {
    const c = document.createElement('span');
    c.className = 'count';
    c.textContent = count;
    const small = document.createElement('small');
    small.textContent = count === 1 ? 'person' : 'people';
    c.appendChild(small);
    b.appendChild(c);
  }
  b.addEventListener('click', () => {
    $('#embeds-sheet').close();
    watch(src);
  });
  li.appendChild(b);
  return li;
}

async function refreshEmbeds() {
  const list = $('#embeds-list');
  const note = $('#embeds-note');
  for (const b of document.querySelectorAll('#embeds-range button')) {
    b.setAttribute('aria-checked', String(Number(b.dataset.minutes) === embedsMinutes));
  }
  let data;
  try {
    const res = await fetch(`api/embeds?minutes=${embedsMinutes}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    note.textContent = "Couldn't load the embed list. Check your connection.";
    return;
  }

  const rows = [embedRow(DEFAULT_SOURCE, 'Destiny', 'Kick · destiny', null)];
  for (const e of data.embeds) {
    const src = parseSource(e.key);
    if (!src || key(src) === key(DEFAULT_SOURCE)) continue;
    const platform = PLATFORM_NAMES[src.type] || src.type;
    const name = e.title || src.id;
    const meta = `${platform}${e.title ? ' · ' + src.id : ''} · ${timeAgo(e.lastPosted)}`;
    rows.push(embedRow(src, name, meta, e.count));
  }
  list.replaceChildren(...rows);

  if (!data.chatConnected) {
    note.textContent = 'Not connected to destiny.gg chat right now, so this list may be out of date.';
  } else if (!data.embeds.length) {
    const since = data.watchingSince && Date.now() - data.watchingSince < embedsMinutes * 60000;
    note.textContent = since
      ? 'No embeds posted since the list started watching chat ' + timeAgo(data.watchingSince) + '.'
      : `Nobody has posted an embed in the last ${embedsMinutes} minutes.`;
  } else {
    note.textContent = 'Counts are how many different people posted each link. Updates every 20 seconds.';
  }
}

function openEmbeds() {
  $('#embeds-list').replaceChildren();
  $('#embeds-note').textContent = 'Loading…';
  $('#embeds-sheet').showModal();
  refreshEmbeds();
  clearInterval(embedsTimer);
  embedsTimer = setInterval(refreshEmbeds, 20000);
}

$('#embeds-btn').addEventListener('click', openEmbeds);
$('#embeds-close').addEventListener('click', () => $('#embeds-sheet').close());
$('#embeds-sheet').addEventListener('close', () => clearInterval(embedsTimer));
// Tapping the dimmed area outside the sheet closes it.
$('#embeds-sheet').addEventListener('click', (e) => {
  if (e.target !== e.currentTarget) return;
  const r = e.currentTarget.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside) e.currentTarget.close();
});
for (const b of document.querySelectorAll('#embeds-range button')) {
  b.addEventListener('click', () => {
    embedsMinutes = Number(b.dataset.minutes);
    store.set('embedsMinutes', embedsMinutes);
    refreshEmbeds();
  });
}

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
const last = store.get('last', null);
watch(parseSource(location.hash) || (last && last.type && validate(last)) || DEFAULT_SOURCE);
