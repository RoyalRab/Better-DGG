// destiny.gg's chat, in an iframe beside or under the player.

import { $, settings, store, isRowLayout, rowLayoutQuery } from './util.js';
import { layoutTiles } from './stage.js';

export function renderChat() {
  document.body.classList.toggle('no-chat', !settings.showChat);
  layoutTiles();
}

// Chat loads once the first stream is playing (or after a few seconds), so
// it doesn't compete with the stream for bandwidth at startup.
let chatLoaded = false;
let frameLoads = 0; // loads of the frame since the app last set its address
// Until chat has loaded, the panel shows "Loading chat…" (the iframe stays
// hidden so a blank page doesn't flash over it).
const frame = $('#chat-frame');
frame.addEventListener('load', () => {
  if (frame.getAttribute('src')) frame.classList.add('loaded');
});

export function loadChat(force = false) {
  if (chatLoaded || (!settings.showChat && !force)) return;
  frameLoads = 0;
  frame.src = frame.dataset.src;
  chatLoaded = true;
}

export function reloadChat() {
  if (!chatLoaded) return loadChat(true);
  frame.classList.remove('loaded');
  frameLoads = 0;
  frame.src = frame.dataset.src;
}

// ---------- Signing in and out ----------
// The app can't see whether chat is signed in (it's destiny.gg's page in a
// frame). Sign in and out open destiny.gg in a new tab, and chat reloads
// when you come back to the app.
export function openDgg(path) {
  window.open('https://www.destiny.gg' + path, '_blank', 'noopener');
  const back = () => {
    if (document.hidden) return;
    document.removeEventListener('visibilitychange', back);
    reloadChat();
  };
  document.addEventListener('visibilitychange', back);
}

// The chat's own "log in" link navigates the frame to destiny.gg's login
// page, which refuses to be shown inside another site (the panel went
// blank with a broken-page icon). The page's Content-Security-Policy only
// lets the frame show the chat embed, so that navigation is blocked here,
// and the login page opens in a new tab instead.
document.addEventListener('securitypolicyviolation', (e) => {
  if (!e.violatedDirective.startsWith('frame-src') || !/destiny\.gg/.test(e.blockedURI)) return;
  let path = '/login';
  try {
    const u = new URL(e.blockedURI);
    if (u.pathname && u.pathname !== '/') path = u.pathname + u.search;
  } catch {}
  reloadChat();
  openDgg(path);
});
// A browser that doesn't report the block: the frame's second load is a page
// other than the chat, so put the chat back.
frame.addEventListener('load', () => {
  if (!frame.getAttribute('src')) return;
  frameLoads++;
  if (frameLoads > 1) {
    frameLoads = 0;
    reloadChat();
  }
});

// ---------- Resizing ----------
// In landscape and on desktop, drag the line between the stream and chat (or
// use the arrow keys on it) to change chat's width. Double-click resets it.

const MIN_CHAT = 240;
const MIN_PLAYER = 320;
const resizer = $('#chat-resizer');
const stageEl = $('#stage');

function clampWidth(w) {
  const max = stageEl.clientWidth - MIN_PLAYER;
  return Math.round(Math.max(MIN_CHAT, Math.min(w, max)));
}

function setChatWidth(w, save = true) {
  if (w == null) {
    stageEl.style.removeProperty('--chat-w');
    if (save) store.set('chatWidth', null);
  } else {
    const px = clampWidth(w);
    stageEl.style.setProperty('--chat-w', px + 'px');
    if (save) store.set('chatWidth', px);
  }
  renderResizer();
  layoutTiles();
}

function renderResizer() {
  const w = $('#chat').getBoundingClientRect().width;
  resizer.setAttribute('aria-valuenow', String(Math.round(w)));
  resizer.setAttribute('aria-valuemin', String(MIN_CHAT));
  resizer.setAttribute('aria-valuemax', String(Math.max(MIN_CHAT, stageEl.clientWidth - MIN_PLAYER)));
}

const saved = store.get('chatWidth', null);
if (saved) stageEl.style.setProperty('--chat-w', saved + 'px');

resizer.addEventListener('pointerdown', (e) => {
  if (!isRowLayout()) return;
  e.preventDefault();
  resizer.setPointerCapture(e.pointerId);
  // Iframes would swallow the pointer while dragging over them.
  document.body.classList.add('resizing');
  const right = stageEl.getBoundingClientRect().right;
  const move = (ev) => setChatWidth(right - ev.clientX, false);
  const done = () => {
    document.body.classList.remove('resizing');
    resizer.removeEventListener('pointermove', move);
    resizer.removeEventListener('pointerup', done);
    resizer.removeEventListener('pointercancel', done);
    setChatWidth($('#chat').getBoundingClientRect().width);
  };
  resizer.addEventListener('pointermove', move);
  resizer.addEventListener('pointerup', done);
  resizer.addEventListener('pointercancel', done);
});
resizer.addEventListener('dblclick', () => setChatWidth(null));
resizer.addEventListener('keydown', (e) => {
  const w = $('#chat').getBoundingClientRect().width;
  const step = e.shiftKey ? 80 : 20;
  if (e.key === 'ArrowLeft') setChatWidth(w + step);
  else if (e.key === 'ArrowRight') setChatWidth(w - step);
  else if (e.key === 'Home') setChatWidth(MIN_CHAT);
  else if (e.key === 'End') setChatWidth(stageEl.clientWidth - MIN_PLAYER);
  else return;
  e.preventDefault();
});
rowLayoutQuery.addEventListener('change', renderResizer);
