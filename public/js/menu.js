// The ⋮ action row, the settings sheet (settings, actions, version and change log), the cast sheet
// and the install bar.

import { state, isCurrent } from './state.js';
import { $, settings, saveSetting, store, toast, isIOS, isAndroid, isTouch, standalone } from './util.js';
import { OWN_PLAYER_TYPES } from './players.js';
import { mountTile, setAddMode, updateWakeLock, layoutTiles, dropParked, pauseSound } from './stage.js';
import { renderChat, loadChat, reloadChat, openDgg } from './chat.js';
import { toggleFavorite } from './tabs.js';
import { applyUpdateOrReload } from './bars.js';

// ---------- Sheets ----------
// On phones the menus are bottom sheets that can be swiped down to close.

const sheetLayout = window.matchMedia('(max-width: 640px)');

// Close right away: an animation here felt slow with a stream playing behind it.
function closeSheet(dialog) {
  if (dialog.open) dialog.close();
}

function swipeToClose(dialog) {
  let startY = null;
  let dy = 0;
  let startT = 0;
  dialog.addEventListener('close', () => {
    dialog.classList.remove('closing');
    dialog.style.removeProperty('transform');
    dialog.style.removeProperty('transition');
  });
  dialog.addEventListener(
    'touchstart',
    (e) => {
      startY = sheetLayout.matches && dialog.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      dy = 0;
      startT = Date.now();
    },
    { passive: true },
  );
  dialog.addEventListener(
    'touchmove',
    (e) => {
      if (startY == null) return;
      dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        dialog.style.removeProperty('transform');
        if (dy < -10) startY = null; // scrolling the sheet's content up
        return;
      }
      e.preventDefault();
      dialog.style.transition = 'none';
      dialog.style.transform = `translateY(${dy}px)`;
    },
    { passive: false },
  );
  dialog.addEventListener('touchend', () => {
    if (startY == null) return;
    startY = null;
    dialog.style.removeProperty('transition');
    const flick = dy > 40 && Date.now() - startT < 250;
    if (dy > 100 || flick) closeSheet(dialog);
    else dialog.style.removeProperty('transform');
  });
}

for (const d of document.querySelectorAll('dialog')) swipeToClose(d);

// ---------- Menu ----------

// The same actions as the ⋮ row, listed with their names so each icon is
// explained. Each one runs the row's button.
function renderSheetActions() {
  const rows = [...$('#actions').querySelectorAll('button')]
    .filter((b) => b.id !== 'settings-btn' && !b.hidden)
    .map((b) => {
      const row = document.createElement('button');
      row.type = 'button';
      const label = document.createElement('span');
      label.textContent = b.getAttribute('aria-label');
      row.append(b.querySelector('svg').cloneNode(true), label);
      row.addEventListener('click', () => {
        $('#sheet').close();
        b.click();
      });
      return row;
    });
  $('#sheet-actions').replaceChildren(...rows);
}

export function openSheet(scrollTo) {
  renderSheetActions();
  $('#opt-awake').checked = settings.keepAwake;
  $('#opt-chat').checked = settings.showChat;
  $('#opt-own').checked = settings.ownPlayer;
  $('#opt-chat-left').checked = settings.chatLeft;
  $('#opt-reports').checked = settings.errorReports;
  renderSleep();
  $('#sheet').showModal();
  // Scroll inside the sheet only (scrollIntoView could also move the page behind it).
  if (scrollTo) $('#sheet').scrollTop = $(scrollTo).offsetTop - 8;
}

$('#sheet-close').addEventListener('click', () => closeSheet($('#sheet')));

// ---------- Actions ----------
// ⋮ slides a row of icon buttons out over the tab row; ✕ (the same button)
// or using one of them slides it back.

function setActions(open) {
  if (open) hideMenuTip();
  $('#actions').hidden = !open;
  $('#menu-btn').setAttribute('aria-expanded', String(open));
  $('#menu-btn').setAttribute('aria-label', open ? 'Close' : 'More');
  $('#menu-btn').title = open ? 'Close' : 'More';
}

$('#menu-btn').addEventListener('click', () => setActions($('#actions').hidden));

// ---------- First-time tip ----------
// A bubble pointing at ⋮, once, for anyone who hasn't opened the action row
// yet. Tapping it, opening the row, or 10 s puts it away.

let tipTimer = null;

function placeMenuTip() {
  const tip = $('#menu-tip');
  const b = $('#menu-btn').getBoundingClientRect();
  // The button's tap area reaches 8 px above and below the visible row.
  const rowTop = b.top + 8;
  const rowBottom = b.bottom - 8;
  tip.style.right = Math.max(8, window.innerWidth - b.right + 4) + 'px';
  // Above the row, or below it when the row is at the top (beside chat).
  const below = rowTop < tip.offsetHeight + 16;
  tip.classList.toggle('below', below);
  tip.style.top = below ? rowBottom + 10 + 'px' : '';
  tip.style.bottom = below ? '' : window.innerHeight - rowTop + 10 + 'px';
}

let tipTries = 0;
export function maybeShowMenuTip() {
  if (store.get('menuTipShown', false) || !$('#actions').hidden) return;
  // Not on top of the install bar: wait for it to be answered (up to a minute).
  if (!$('#install-bar').hidden && tipTries++ < 20) {
    setTimeout(maybeShowMenuTip, 3000);
    return;
  }
  store.set('menuTipShown', true);
  $('#menu-tip-verb').textContent = isTouch ? 'Tap' : 'Click';
  $('#menu-tip').hidden = false;
  placeMenuTip();
  window.addEventListener('resize', placeMenuTip);
  tipTimer = setTimeout(hideMenuTip, 10000);
}

function hideMenuTip() {
  clearTimeout(tipTimer);
  $('#menu-tip').hidden = true;
  window.removeEventListener('resize', placeMenuTip);
}

$('#menu-tip').addEventListener('click', hideMenuTip);
$('#actions').addEventListener('click', (e) => {
  if (e.target.closest('button')) setActions(false);
});
$('#settings-btn').addEventListener('click', () => openSheet());
// A tap anywhere else, or Escape, puts the row away.
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!$('#actions').hidden && !e.target.closest('#tabbar')) setActions(false);
  },
  { passive: true },
);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#actions').hidden) setActions(false);
});

$('#opt-awake').addEventListener('change', (e) => {
  saveSetting('keepAwake', e.target.checked);
  updateWakeLock();
});
$('#opt-chat').addEventListener('change', (e) => {
  saveSetting('showChat', e.target.checked);
  renderChat();
  loadChat();
});
$('#opt-chat-left').addEventListener('change', (e) => {
  saveSetting('chatLeft', e.target.checked);
  renderChat();
});
$('#opt-reports').addEventListener('change', (e) => saveSetting('errorReports', e.target.checked));

// ---------- Favorites ----------
$('#fav-btn').addEventListener('click', () => {
  if (state.current) toggleFavorite(state.current);
});

// ---------- Sleep timer ----------
// Pauses the stream with the sound when the time is up. The end time is
// kept, so a reload or an update doesn't lose it.
let sleepTick = null;
function renderSleep() {
  const until = store.get('sleepUntil', 0);
  const left = until - Date.now();
  const status = $('#sleep-status');
  if (left > 0) {
    const m = Math.ceil(left / 60000);
    status.textContent = `Pausing in ${m} min.`;
  } else status.textContent = '';
  for (const b of $('#sleep-buttons').querySelectorAll('button')) {
    const v = Number(b.dataset.sleep);
    b.setAttribute('aria-pressed', String(left > 0 ? false : v === 0));
  }
}
function checkSleep() {
  const until = store.get('sleepUntil', 0);
  if (!until) return;
  if (Date.now() >= until) {
    store.set('sleepUntil', 0);
    pauseSound();
    toast('Sleep timer: paused', 5000);
    renderSleep();
  } else if ($('#sheet').open) renderSleep();
}
$('#sleep-buttons').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sleep]');
  if (!b) return;
  const min = Number(b.dataset.sleep);
  store.set('sleepUntil', min > 0 ? Date.now() + min * 60000 : 0);
  toast(min > 0 ? `Sleep timer: pausing in ${min} min` : 'Sleep timer off');
  renderSleep();
});
if (store.get('sleepUntil', 0) > Date.now()) sleepTick = setInterval(checkSleep, 15000);
$('#sleep-buttons').addEventListener('click', () => {
  clearInterval(sleepTick);
  sleepTick = setInterval(checkSleep, 15000);
});

$('#opt-own').addEventListener('change', (e) => {
  saveSetting('ownPlayer', e.target.checked);
  dropParked();
  for (const t of state.tiles) if (OWN_PLAYER_TYPES.has(t.src.type)) mountTile(t);
});

$('#multi-btn').addEventListener('click', () => setAddMode(true));

// Reloads everything, applying a downloaded update first if there is one.
$('#refresh-btn').addEventListener('click', applyUpdateOrReload);

$('#reload-chat').addEventListener('click', reloadChat);

const DGG_LOGIN = '/login';
// destiny.gg signs out with a form that needs a token from its own page, so
// this opens the site, where sign-out is in the account menu.
const DGG_LOGOUT = '/';

// ---------- Chat account ----------
// The app can't see whether chat is signed in, so both are offered (openDgg
// in chat.js opens destiny.gg in a new tab and reloads chat on return).

// Where to allow third-party cookies, for the browser this is.
function cookieSteps() {
  const ua = navigator.userAgent;
  if (isIOS) {
    return "Settings → Apps → Safari → turn off Prevent Cross-Site Tracking, sign in on destiny.gg in Safari, and use the app in Safari. The home-screen app keeps its own separate login and may not be able to share Safari's.";
  }
  if (/SamsungBrowser/.test(ua)) {
    return 'Samsung Internet: ☰ → Settings → Privacy → turn off Block third-party cookies (under Smart anti-tracking).';
  }
  if (/Firefox/.test(ua)) {
    return 'Firefox: tap the shield icon in the address bar and turn Enhanced Tracking Protection off for this site.';
  }
  if (/Edg\//.test(ua)) {
    return 'Edge: Settings → Cookies and site permissions → Manage and delete cookies and site data → turn off Block third-party cookies, or add this site under Allow.';
  }
  if (/Chrome\//.test(ua)) {
    return isAndroid
      ? 'Chrome: ⋮ → Settings → Site settings → Third-party cookies → Allow third-party cookies, or add this site under Sites allowed to use third-party cookies.'
      : 'Chrome: ⋮ → Settings → Privacy and security → Third-party cookies → Allow third-party cookies, or add this site under Allowed to use third-party cookies.';
  }
  if (/Safari/.test(ua)) return 'Safari: Settings → Privacy → turn off Prevent cross-site tracking.';
  return "Allow third-party cookies (or cookies for all sites) in your browser's privacy settings.";
}
$('#cookie-steps').textContent = cookieSteps();

$('#sign-in').addEventListener('click', () => openDgg(DGG_LOGIN));
$('#sign-out').addEventListener('click', () => openDgg(DGG_LOGOUT));

// Version line at the bottom of the menu, from the server.
fetch('api/version', { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : null))
  .then((v) => {
    if (v && v.version) {
      versionLine = `Version ${v.version}${v.commit ? ` (${v.commit})` : ''}`;
      $('#version').textContent = versionLine;
    }
  })
  .catch(() => {});

// ---------- Share ----------
// The installed app has no address bar, so settings show the address and a
// Share button (the phone's share sheet, or copy the link where there's none).

$('#app-address').textContent = location.host;
$('#share-btn').addEventListener('click', async () => {
  const url = location.origin + '/';
  if (navigator.share) {
    try {
      await navigator.share({ title: 'DGG Remix', text: "destiny.gg's live embeds and chat, made for phones", url });
    } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    toast(url, 5000);
  }
});

// ---------- Ideas and problems ----------
// Both go to GitHub issue forms. The problem form is pre-filled with the
// app's version and the kind of browser, which the person can edit first.

const REPO = 'https://github.com/RoyalRab/Better-DGG';
let versionLine = '';

function browserName() {
  const ua = navigator.userAgent;
  const os = isIOS
    ? 'iPhone/iPad'
    : isAndroid
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unknown OS';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /Firefox/.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'unknown browser';
  return `${os}, ${browser}`;
}

$('#idea-btn').addEventListener('click', () => {
  window.open(`${REPO}/issues/new?template=idea.yml`, '_blank', 'noopener');
});
$('#bug-btn').addEventListener('click', () => {
  const where = [
    versionLine || 'Version unknown',
    browserName(),
    standalone ? 'installed app' : 'browser tab',
    `${window.innerWidth}×${window.innerHeight}`,
  ].join(', ');
  window.open(`${REPO}/issues/new?template=bug.yml&environment=${encodeURIComponent(where)}`, '_blank', 'noopener');
});

// ---------- Change log ----------
// From CHANGELOG.md, which the server turns into changelog.json. The latest
// version is listed in the menu, older ones are folded underneath.

function versionList(entries) {
  const frag = document.createDocumentFragment();
  for (const e of entries) {
    const h = document.createElement('h4');
    h.textContent = e.date ? `${e.version} · ${e.date}` : e.version;
    const ul = document.createElement('ul');
    for (const item of e.items) {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    }
    frag.append(h, ul);
  }
  return frag;
}

export function renderChangelog(entries) {
  const box = $('#changelog');
  if (!entries.length) return;
  const [latest, ...older] = entries;
  const title = document.createElement('h3');
  title.id = 'changelog-title';
  title.textContent = `What's new in ${latest.version}`;
  const ul = versionList([latest]).querySelector('ul');
  box.replaceChildren(title, ul);
  if (older.length) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Earlier versions';
    details.append(summary, versionList(older));
    box.appendChild(details);
  }
  box.hidden = false;
}

// ---------- Cast to TV ----------

function castSteps() {
  const steps = [];
  if (isAndroid) {
    steps.push([
      'Whole screen, with chat',
      'Swipe down for quick settings and tap Smart View (Samsung) or Screen cast, then pick your TV.',
    ]);
  } else if (isIOS) {
    steps.push([
      'Whole screen, with chat',
      "Open Control Center, tap Screen Mirroring and pick an AirPlay TV. Chromecast doesn't support AirPlay.",
    ]);
  } else {
    steps.push([
      'This tab, with chat',
      'In Chrome or Edge, open the browser menu (⋮ or … at the top right), choose Cast, save, and share, then Cast…, set Sources to Cast tab and pick your TV.',
    ]);
  }
  steps.push([
    'Just the video',
    'If the player shows a cast icon (YouTube and Twitch often do), tap it to send only the stream to your Chromecast.',
  ]);
  return steps;
}

function castableTile() {
  const t = state.tiles.find((x) => isCurrent(x.src));
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
  $('#cast-steps').replaceChildren(
    ...castSteps().map(([title, text]) => {
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.textContent = title + '. ';
      p.append(b, text);
      return p;
    }),
  );
  $('#sheet').close();
  $('#cast-sheet').showModal();
});
$('#cast-close').addEventListener('click', () => closeSheet($('#cast-sheet')));

if (isIOS && !standalone) $('#ios-install').hidden = false;
if (isAndroid) $('#android-tip').hidden = false;

// ---------- Install ----------
// A bar at the top offers to install the app. Chrome and Edge get a one-tap
// install; iPhones and in-app browsers get instructions instead.

let installPrompt = null;
const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

const installSnoozed = () => Date.now() - store.get('installDismissedAt', 0) < INSTALL_SNOOZE_MS;

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
  showInstallBar('Install DGG Remix for full screen and quick access', true);
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

// No install prompt from the browser: explain how instead. On Android that
// means a browser other than Chrome (Firefox, Samsung Internet, or an app's
// built-in browser); Chrome either offers the prompt or already has the app.
const ua = navigator.userAgent;
const androidChrome = isAndroid && /\bChrome\//.test(ua) && !/\bwv\b|Edg|OPR|SamsungBrowser|Firefox/.test(ua);
setTimeout(() => {
  if (installPrompt || standalone) return;
  if (isIOS) showInstallBar('Install: tap Share, then Add to Home Screen', false);
  else if (isAndroid && !androidChrome) showInstallBar('To install the app, open this page in Chrome', false);
}, 3000);
