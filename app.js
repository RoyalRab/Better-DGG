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
// A source is { type: 'kick' | 'youtube' | 'twitch' | 'rumble', id }.
// Accepts DGG bigscreen style (#kick/destiny) and normal platform links.

const DEFAULT_SOURCE = { type: 'kick', id: 'destiny' };
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const NAME = /^[A-Za-z0-9_-]{1,40}$/;

function parseSource(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  s = s.replace(/^#/, '');

  const embed = s.match(/^(kick|youtube|twitch|rumble)\/([^/?#\s]+)$/i);
  if (embed) return validate({ type: embed[1].toLowerCase(), id: embed[2] });

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
  } catch { return null; }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'kick.com' || host === 'player.kick.com') {
    return parts[0] ? validate({ type: 'kick', id: parts[0] }) : null;
  }
  if (host === 'twitch.tv' || host === 'player.twitch.tv') {
    const id = url.searchParams.get('channel') || parts[0];
    return id ? validate({ type: 'twitch', id }) : null;
  }
  if (host === 'youtu.be') {
    return parts[0] ? validate({ type: 'youtube', id: parts[0] }) : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v) return validate({ type: 'youtube', id: v });
    if (['live', 'embed', 'shorts', 'v'].includes(parts[0]) && parts[1]) {
      return validate({ type: 'youtube', id: parts[1] });
    }
    return null;
  }
  if (host === 'rumble.com' && parts[0] === 'embed' && parts[1]) {
    return validate({ type: 'rumble', id: parts[1] });
  }
  return null;
}

function validate(src) {
  if (src.type === 'youtube') return YT_ID.test(src.id) ? src : null;
  if (src.type === 'twitch' || src.type === 'kick') {
    return NAME.test(src.id) ? { type: src.type, id: src.id.toLowerCase() } : null;
  }
  return NAME.test(src.id) ? src : null;
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
  return { play() {}, destroy() { f.remove(); } };
}

async function mountYouTube(id) {
  await loadYouTubeApi();
  const holder = document.createElement('div');
  holder.id = 'yt-' + Date.now();
  $('#player').appendChild(holder);
  const yt = new YT.Player(holder, {
    videoId: id,
    playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
    events: {
      onStateChange(e) {
        if (e.data === YT.PlayerState.PLAYING) onPlaying();
        else if (e.data === YT.PlayerState.PAUSED) onPaused();
      },
    },
  });
  return {
    play() { try { yt.playVideo(); } catch {} },
    destroy() {
      try { yt.destroy(); } catch {}
      const el = document.getElementById(holder.id);
      if (el) el.remove();
    },
  };
}

async function mountTwitch(channel) {
  await loadScript('https://player.twitch.tv/js/embed/v1.js');
  const holder = document.createElement('div');
  holder.id = 'twitch-' + Date.now();
  $('#player').appendChild(holder);
  const tw = new Twitch.Player(holder.id, {
    channel,
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
    destroy() { holder.remove(); },
  };
}

async function watch(src, { remember = true } = {}) {
  if (current && key(current) === key(src) && player) return;
  if (player) player.destroy();
  player = null;
  $('#player').replaceChildren();
  current = src;
  wantPlaying = false;
  $('#source-label').textContent = key(src);
  document.title = `${key(src)} · Better DGG`;
  history.replaceState(null, '', '#' + key(src));
  const token = ++mountToken;

  let mounted;
  try {
    if (src.type === 'youtube') mounted = await mountYouTube(src.id);
    else if (src.type === 'twitch') mounted = await mountTwitch(src.id);
    else if (src.type === 'kick') mounted = mountFrame(`https://player.kick.com/${encodeURIComponent(src.id)}?autoplay=true`);
    else if (src.type === 'rumble') mounted = mountFrame(`https://rumble.com/embed/${encodeURIComponent(src.id)}/`);
  } catch (err) {
    if (token !== mountToken) return;
    const msg = document.createElement('div');
    msg.className = 'empty';
    msg.textContent = 'Could not load the player. Check your connection and try again.';
    $('#player').replaceChildren(msg);
    current = null;
    return;
  }
  // Another stream was picked while this one was loading.
  if (token !== mountToken) { mounted.destroy(); return; }
  player = mounted;

  if (remember) {
    store.set('last', src);
    const recent = store.get('recent', []).filter((r) => key(r) !== key(src));
    recent.unshift(src);
    store.set('recent', recent.slice(0, 6));
  }
  updateWakeLock();
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
