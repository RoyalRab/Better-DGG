// The ⋮ action row, the settings sheet (settings, actions, version and change log), the cast sheet
// and the install bar.

import { state, isCurrent, knownNames } from './state.js';
import { parseSource, key } from './sources.js';
import { $, settings, saveSetting, store, toast, isIOS, isAndroid, isTouch, standalone, applyTheme } from './util.js';
import { OWN_PLAYER_TYPES } from './players.js';
import {
  mountTile,
  setAddMode,
  updateWakeLock,
  layoutTiles,
  dropParked,
  pauseSound,
  setFocusLayout,
  watch,
} from './stage.js';
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
// The ⋮ menu's buttons carry their names in aria-label (pip.js changes
// one as it goes); the dropdown shows them as text as well.
function labelActions() {
  for (const b of $('#actions').querySelectorAll('button')) {
    let span = b.querySelector('.label');
    if (!span) {
      span = document.createElement('span');
      span.className = 'label';
      b.append(span);
    }
    span.textContent = b.getAttribute('aria-label');
  }
}
labelActions();
new MutationObserver(labelActions).observe($('#actions'), {
  attributes: true,
  attributeFilter: ['aria-label'],
  subtree: true,
});

// Settings has two pages: the main one and Theme.
function showPage(name) {
  $('#page-main').hidden = name !== 'main';
  $('#page-theme').hidden = name !== 'theme';
  $('#sheet-back').hidden = name === 'main';
  $('#sheet-title').textContent = name === 'theme' ? 'Theme' : 'Settings';
  $('#sheet').scrollTop = 0;
}
$('#theme-open').addEventListener('click', () => showPage('theme'));
$('#sheet-back').addEventListener('click', () => showPage('main'));

// Destiny's latest videos and Kick VODs (from the live snapshot), shown in
// settings only while none of his streams is live. Tapping one plays it in
// the app (YouTube's player, or the app's own player for a Kick VOD).
function renderLatest() {
  const videos = (state.live && state.live.videos) || [];
  const destinyLive = state.tabItems.some((i) => i.destiny);
  const show = !destinyLive && videos.length > 0;
  $('#latest').hidden = !show;
  if (!show) return;
  const rows = videos.map((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'latest-item';
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    if (v.thumb) img.src = v.thumb;
    const text = document.createElement('span');
    const title = document.createElement('b');
    title.textContent = v.title || (v.platform === 'youtube' ? 'YouTube video' : 'Kick VOD');
    const kind = document.createElement('small');
    kind.textContent = v.platform === 'youtube' ? 'YouTube' : 'Kick VOD';
    text.append(title, kind);
    b.append(img, text);
    b.addEventListener('click', () => {
      const src = parseSource(`${v.platform}/${v.id}`);
      if (!src) return;
      knownNames.set(key(src), v.platform === 'youtube' ? 'Destiny (YouTube)' : 'Destiny (VOD)');
      $('#sheet').close();
      watch(src);
    });
    return b;
  });
  $('#latest-list').replaceChildren(...rows);
}
document.addEventListener('livelist', () => {
  if ($('#sheet').open) renderLatest();
});

export function openSheet(scrollTo) {
  showPage('main');
  renderLatest();
  renderInstall();
  renderThemes();
  // The installed app's window geometry (main.js), for debugging the
  // Android button-bar padding from a screenshot.
  const insets = document.documentElement.dataset.insets;
  $('#display-info').textContent = insets ? `Display: ${insets}` : '';
  $('#display-info').hidden = !insets;
  renderPush();
  $('#opt-awake').checked = settings.keepAwake;
  $('#opt-chat').checked = settings.showChat;
  $('#opt-own').checked = settings.ownPlayer;
  $('#opt-chat-left').checked = settings.chatLeft;
  $('#opt-landscape').checked = settings.landscapeFull;
  $('#opt-reports').checked = settings.errorReports;
  $('#opt-audio').checked = settings.audioOnly;
  $('#opt-quality').value = String(settings.kickQuality);
  $('#opt-datasaver').checked = settings.dataSaver;
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
// Landscape on phones: body.landscape-full, which app.css applies only in
// landscape under 600 px tall on touch screens.
function renderLandscape() {
  document.body.classList.toggle('landscape-full', !!settings.landscapeFull);
  document.body.classList.toggle('overlay-off', store.get('overlayOff', false));
  const off = store.get('overlayOff', false);
  const btn = $('#overlay-btn');
  btn.setAttribute('aria-pressed', String(!off));
  btn.setAttribute('aria-label', off ? 'Show chat over the stream' : 'Hide chat over the stream');
  btn.title = btn.getAttribute('aria-label');
  layoutTiles();
}
renderLandscape();
$('#opt-landscape').addEventListener('change', (e) => {
  saveSetting('landscapeFull', e.target.checked);
  renderLandscape();
});
$('#overlay-btn').addEventListener('click', () => {
  store.set('overlayOff', !store.get('overlayOff', false));
  renderLandscape();
});
$('#focus-btn').addEventListener('click', () => setFocusLayout(!state.focus));

// "Destiny is live" notifications: web push through the service worker,
// with the server's public key. Needs a browser with push (Safari only as
// an installed app) and the server to have keys; otherwise the row explains.
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function pushSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
function renderPush(hint = '') {
  const row = $('#push-row');
  const ok = pushSupported();
  row.hidden = !ok;
  $('#push-hint').hidden = !hint && ok;
  $('#push-hint').textContent =
    hint ||
    (ok
      ? ''
      : isIOS && !standalone
        ? 'On iPhone and iPad, notifications work once the app is installed (Share → Add to Home Screen).'
        : 'This browser has no notifications.');
  $('#opt-push').checked = !!settings.push;
}
async function subscribePush() {
  const r = await fetch('api/push/key', { cache: 'no-store' });
  if (!r.ok) throw new Error('Notifications are off on the server right now.');
  const { key } = await r.json();
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  const res = await fetch('api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error("Couldn't register for notifications.");
}
async function unsubscribePush() {
  const sub = await pushSubscription().catch(() => null);
  if (!sub) return;
  fetch('api/push/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
$('#opt-push').addEventListener('change', async (e) => {
  const on = e.target.checked;
  e.target.disabled = true;
  try {
    if (on) await subscribePush();
    else await unsubscribePush();
    saveSetting('push', on);
    renderPush(on ? "You'll get a notification when Destiny goes live." : '');
  } catch (err) {
    saveSetting('push', false);
    renderPush(err.message || 'Notifications could not be turned on.');
  }
  e.target.disabled = false;
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
// Audio only swaps the element, so the Kick tiles start over; the quality
// cap and the data saver apply to the running players.
$('#opt-audio').addEventListener('change', (e) => {
  saveSetting('audioOnly', e.target.checked);
  dropParked();
  for (const t of state.tiles) if (OWN_PLAYER_TYPES.has(t.src.type)) mountTile(t);
});
const applyQualityAll = () => {
  for (const t of state.tiles) t.player?.applyQuality?.();
};
$('#opt-quality').addEventListener('change', (e) => {
  saveSetting('kickQuality', e.target.value);
  applyQualityAll();
});
$('#opt-datasaver').addEventListener('change', (e) => {
  saveSetting('dataSaver', e.target.checked);
  applyQualityAll();
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

// ---------- Install ----------
// Everyone gets told how to install, whatever the browser: a bar at the top
// (one-tap Install where the browser offers a prompt, otherwise a How button
// that opens the steps), the Install button in the ⋮ row, and a "Get the app"
// section in settings with the steps for this browser and, folded, for every
// other one. Chrome tells the page when the app is already installed
// (getInstalledRelatedApps, through the manifest's related_applications), so
// the bar stays away then.

let installPrompt = null;
let installedHere = false;
const INSTALL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const installSnoozed = () => Date.now() - store.get('installDismissedAt', 0) < INSTALL_SNOOZE_MS;

const ua = navigator.userAgent;
const has = (re) => re.test(ua);
const iosSafari = isIOS && has(/Safari/) && !has(/CriOS|FxiOS|EdgiOS|OPT\/|DuckDuckGo/);
const inAppBrowser = has(/\bwv\b|FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|TikTok|Reddit\//);
const androidChrome = isAndroid && has(/\bChrome\//) && !has(/Edg|OPR|SamsungBrowser|Firefox/) && !inAppBrowser;
const desktop = !isIOS && !isAndroid;
const SITE = location.host;

// The steps, per browser. The first one whose test passes is this browser;
// the rest are listed under "Other browsers and devices".
const INSTALL_GUIDES = [
  {
    name: 'Safari on iPhone or iPad',
    test: () => iosSafari,
    steps:
      'Tap the Share button (the square with an arrow pointing up), scroll down and tap Add to Home Screen, then Add. The app opens from its icon, full screen.',
  },
  {
    name: 'Other browsers on iPhone or iPad',
    test: () => isIOS,
    steps: `Tap the browser's Share or ⋮ button and look for Add to Home Screen. If it isn't there, open ${SITE} in Safari: Share → Add to Home Screen → Add.`,
  },
  {
    name: 'Chrome on Android',
    test: () => androidChrome,
    steps:
      'Tap Install when the bar at the top offers it; otherwise ⋮ at the top right → Add to Home screen → Install.',
  },
  {
    name: 'Samsung Internet',
    test: () => isAndroid && has(/SamsungBrowser/),
    steps:
      'Tap the install icon (a down arrow) in the address bar when it shows, or ☰ at the bottom right → Add page to → Home screen.',
  },
  {
    name: 'Firefox on Android',
    test: () => isAndroid && has(/Firefox/),
    steps: '⋮ at the top right → Install (older versions: Add to Home screen).',
  },
  {
    name: 'Edge on Android',
    test: () => isAndroid && has(/Edg/),
    steps: '⋯ at the bottom → Add to phone → Install.',
  },
  {
    name: 'Opera on Android',
    test: () => isAndroid && has(/OPR/),
    steps: '⋮ → Add to… → Home screen.',
  },
  {
    name: "Android, from another app's browser",
    test: () => isAndroid,
    steps: `This browser can't install apps. Open ${SITE} in Chrome (⋮ → Open in Chrome, or type the address), then ⋮ → Add to Home screen → Install.`,
  },
  {
    name: 'Chrome on a computer',
    test: () => desktop && has(/Chrome\//) && !has(/Edg|OPR/),
    steps:
      'Click the install icon at the right end of the address bar (a screen with a down arrow), or ⋮ → Cast, save and share → Install page as app. The app gets its own window and a place in the Dock, taskbar or Start menu.',
  },
  {
    name: 'Edge on a computer',
    test: () => desktop && has(/Edg\//),
    steps: 'Click the install icon at the right end of the address bar, or ⋯ → Apps → Install this site as an app.',
  },
  {
    name: 'Opera on a computer',
    test: () => desktop && has(/OPR\//),
    steps: 'Click the install icon in the address bar, or open the Opera menu → Install DGG Remix.',
  },
  {
    name: 'Safari on a Mac',
    test: () => desktop && has(/Mac/) && has(/Safari/) && !has(/Chrome|Firefox/),
    steps: 'File → Add to Dock (macOS Sonoma or later). The app gets its own window and Dock icon.',
  },
  {
    name: 'Firefox on a computer',
    test: () => desktop && has(/Firefox/),
    steps: `Firefox doesn't install web apps. Pin the tab (right-click it → Pin Tab) or put a bookmark on the toolbar; everything works the same in the tab. To install, open ${SITE} in Chrome, Edge or Safari.`,
  },
];
const FALLBACK_GUIDE = {
  name: 'Your browser',
  steps: `Look for Install, Install app or Add to Home screen in the browser's menu. If there's nothing like it, open ${SITE} in Chrome, Edge or Safari.`,
};
const thisGuide = () => INSTALL_GUIDES.find((g) => g.test()) || FALLBACK_GUIDE;

function renderInstall() {
  const guide = thisGuide();
  const status = $('#install-status');
  if (standalone) {
    status.textContent = "You're using the installed app. It opens full screen from its icon, and updates itself.";
  } else if (installedHere) {
    status.textContent =
      'DGG Remix is installed on this device: open it from your home screen or app list for full screen and quick access.';
  } else {
    status.textContent = desktop
      ? 'Installed, DGG Remix opens in its own window from the Dock, taskbar or Start menu, without browser bars.'
      : 'Installed, DGG Remix opens full screen from its own icon, starts with sound, and keeps playing when you lock the phone.';
  }
  $('#install-links').hidden = !installPrompt || standalone;
  $('#install-steps').hidden = standalone;
  $('#install-steps').replaceChildren();
  if (!standalone) {
    const b = document.createElement('b');
    b.textContent = `${guide.name}: `;
    $('#install-steps').append(b, guide.steps);
  }
  $('#install-all').replaceChildren(
    ...INSTALL_GUIDES.filter((g) => g !== guide).map((g) => {
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.textContent = `${g.name}: `;
      p.append(b, g.steps);
      return p;
    }),
  );
  $('#android-tip').hidden = !isAndroid;
}

function showInstallBar() {
  if (standalone || installedHere || installSnoozed()) return;
  $('#install-text').textContent = installPrompt
    ? 'Install DGG Remix for full screen and quick access'
    : 'Get DGG Remix as an app: full screen, quick access';
  $('#install-yes').hidden = !installPrompt;
  $('#install-how').hidden = !!installPrompt;
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
  showInstallBar();
});

async function runInstall() {
  if (!installPrompt) {
    openSheet('#install-head');
    return;
  }
  installPrompt.prompt();
  const choice = await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  hideInstallBar();
  if (choice && choice.outcome === 'dismissed') store.set('installDismissedAt', Date.now());
}

$('#install-yes').addEventListener('click', runInstall);
$('#install-now').addEventListener('click', () => {
  $('#sheet').close();
  runInstall();
});
$('#install-how').addEventListener('click', () => openSheet('#install-head'));
$('#install-btn').addEventListener('click', runInstall);
$('#install-no').addEventListener('click', () => {
  store.set('installDismissedAt', Date.now());
  hideInstallBar();
});
window.addEventListener('appinstalled', () => {
  installedHere = true;
  hideInstallBar();
});

// The Install button in the ⋮ row is for everyone who isn't in the installed
// app: it installs in one tap where the browser offers that, and opens the
// steps otherwise.
$('#install-btn').hidden = standalone;
if (!standalone && navigator.getInstalledRelatedApps) {
  navigator
    .getInstalledRelatedApps()
    .then((apps) => {
      if (apps && apps.length) {
        installedHere = true;
        hideInstallBar();
      }
    })
    .catch(() => {});
}
// No prompt from the browser within a few seconds: show the bar with How.
setTimeout(() => {
  if (!installPrompt) showInstallBar();
}, 3000);

// ---------- Theme ----------
// Colour schemes for the app (app.css has each one's colours under
// html[data-theme]); Custom takes a background and an accent colour and
// derives the rest. The swatch shows each theme's background and accent.
const THEMES = [
  { id: 'dark', name: 'Dark', bg: '#0b0d12', accent: '#2f7cf6' },
  { id: 'purple', name: 'Purple', bg: '#0e0a1a', accent: '#9b5cf6' },
  { id: 'synthwave', name: 'Synthwave', bg: '#150c2a', accent: '#ff3ea5' },
  { id: 'glitchwave', name: 'Glitchwave', bg: '#05070f', accent: '#ff2bd6' },
  { id: 'oled', name: 'OLED black', bg: '#000000', accent: '#2f7cf6' },
  { id: 'green', name: 'Kick green', bg: '#070b08', accent: '#53fc18' },
  { id: 'dgg', name: 'destiny.gg', bg: '#141620', accent: '#59aeea' },
  { id: 'nord', name: 'Nord', bg: '#2e3440', accent: '#88c0d0' },
  { id: 'dracula', name: 'Dracula', bg: '#1e1f29', accent: '#bd93f9' },
  { id: 'catppuccin', name: 'Catppuccin', bg: '#181825', accent: '#cba6f7' },
  { id: 'gruvbox', name: 'Gruvbox', bg: '#1d2021', accent: '#fe8019' },
  { id: 'tokyonight', name: 'Tokyo Night', bg: '#16161e', accent: '#7aa2f7' },
  { id: 'cyberpunk', name: 'Cyberpunk', bg: '#0a0a0a', accent: '#fcee0a' },
  { id: 'vaporwave', name: 'Vaporwave', bg: '#2b1d3a', accent: '#ff71ce' },
  { id: 'matrix', name: 'Matrix', bg: '#000000', accent: '#00ff41' },
  { id: 'custom', name: 'Custom', bg: null, accent: null },
];
function renderThemes() {
  const current = THEMES.some((t) => t.id === settings.theme) ? settings.theme : 'dark';
  const custom = settings.themeCustom;
  const colors = (t) => [t.bg || custom.bg, t.accent || custom.accent];
  $('#theme-row').replaceChildren(
    ...THEMES.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-card';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(t.id === current));
      b.dataset.theme = t.id;
      const [bg, accent] = colors(t);
      const preview = document.createElement('span');
      preview.className = 'tc-preview';
      preview.style.setProperty('--sw-bg', bg);
      preview.style.setProperty('--sw-accent', accent);
      const name = document.createElement('span');
      name.className = 'tc-name';
      name.textContent = t.name;
      b.append(preview, name);
      b.addEventListener('click', () => {
        saveSetting('theme', t.id);
        applyTheme();
        renderThemes();
      });
      return b;
    }),
  );
  const now = THEMES.find((t) => t.id === current);
  $('#theme-current').textContent = now.name;
  const [bg, accent] = colors(now);
  $('#theme-current-swatch').style.setProperty('--sw-bg', bg);
  $('#theme-current-swatch').style.setProperty('--sw-accent', accent);
  $('#theme-custom').hidden = current !== 'custom';
  $('#theme-bg').value = custom.bg;
  $('#theme-accent').value = custom.accent;
}
for (const id of ['#theme-bg', '#theme-accent']) {
  $(id).addEventListener('input', () => {
    saveSetting('themeCustom', { bg: $('#theme-bg').value, accent: $('#theme-accent').value });
    applyTheme();
    renderThemes();
  });
}

// Brave's Shields can stop Twitch's player inside other sites (Brave fixes
// this per site in its brave-checks list; mobile-dgg.com isn't on it yet).
if (navigator.brave) $('#brave-tip').hidden = false;

// ---------- More from destiny.gg ----------
// Everything the site offers beyond the stream and chat, so nothing needs a
// trip to a bookmark: the same links destiny.gg's own menu has.
const DGG_LINKS = [
  ['Subscribe', 'https://www.destiny.gg/subscribe'],
  ['Donate', 'https://www.destiny.gg/donate'],
  ['Merch', 'https://www.destiny.gg/merch'],
  ['VODs', 'https://www.destiny.gg/vods'],
  ['Events', 'https://www.destiny.gg/events'],
  [
    'Schedule',
    'https://calendar.google.com/calendar/u/0/embed?src=i54j4cu9pl4270asok3mqgdrhk@group.calendar.google.com',
  ],
  ['TTS queue', 'https://www.destiny.gg/tts'],
  ['The Vault', 'https://www.destiny.gg/vault'],
  ['Wiki', 'https://wiki.destiny.gg/view/Main_Page'],
  ["Destiny's notes", 'https://publish.obsidian.md/destiny/About'],
  ['destiny.gg', 'https://www.destiny.gg/'],
];
$('#dgg-links').replaceChildren(
  ...DGG_LINKS.map(([label, url]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
    return b;
  }),
);

// Chat in its own window, on desktop (destiny.gg's bigscreen has the same).
if (!isTouch) {
  $('#chat-popout').hidden = false;
  $('#chat-popout').addEventListener('click', () => {
    window.open('https://www.destiny.gg/embed/chat', 'dgg-chat', 'popup,width=420,height=760,noopener');
  });
}
