// Picture-in-picture. Videos the app plays itself (Kick) use the standard
// picture-in-picture API. Other sites' players are iframes the app can't
// reach into; on desktop Chrome and Edge the whole player can move into a
// Document Picture-in-Picture window instead (it reloads when it moves).

import { state, streamName } from './state.js';
import { $, toast } from './util.js';
import { mountTile, soundTile } from './stage.js';

let docPip = null; // { win, tile, placeholder }

export const inDocPip = (t) => !!docPip && docPip.tile === t;

export function closeDocPipFor(t) {
  if (inDocPip(t)) docPip.win.close();
}

function canVideoPip(v) {
  return (
    !!v &&
    ((document.pictureInPictureEnabled && v.requestPictureInPicture) ||
      (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')))
  );
}

function pipAvailable() {
  const t = soundTile();
  if (!t) return false;
  return canVideoPip(t.player && t.player.video) || 'documentPictureInPicture' in window;
}

export function renderPip() {
  $('#pip-btn').hidden = !pipAvailable();
  $('#pip-btn').textContent =
    document.pictureInPictureElement || docPip ? 'Exit picture-in-picture' : 'Picture-in-picture';
}

async function togglePip() {
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture().catch(() => {});
    return;
  }
  if (docPip) {
    docPip.win.close();
    return;
  }
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
  toast(
    "Picture-in-picture works here for Kick streams. For other streams, use the player's own button if it has one.",
  );
}

async function openDocPip(t) {
  let win;
  try {
    win = await window.documentPictureInPicture.requestWindow({ width: 480, height: 270 });
  } catch {
    toast("Couldn't start picture-in-picture");
    return;
  }
  const style = win.document.createElement('style');
  style.textContent =
    'html,body{margin:0;height:100%;background:#000;overflow:hidden}' +
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
    if (state.tiles.includes(t) && !(t.player && t.player.video)) mountTile(t);
  });
}

$('#pip-btn').addEventListener('click', () => {
  $('#sheet').close();
  togglePip();
});
document.addEventListener('enterpictureinpicture', renderPip, true);
document.addEventListener('leavepictureinpicture', renderPip, true);
