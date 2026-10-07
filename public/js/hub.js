// The Community panel (⋮ → Community): DGG Radio, the Destiny wiki searched
// inside the app, and the community's own tools (chat log search, the media
// feed, emote and chat stats, VODs with chat) shown in a frame when the site
// allows it, or opened in the browser when it doesn't.

import { $, toast } from './util.js';
import { state, streamName, knownNames } from './state.js';
import { watch } from './stage.js';

const WIKI = 'https://wiki.destiny.gg';
const RADIO = { type: 'kick', id: 'dggjams' };

// frame: shown inside the app (the site allows it; listed in the server's CSP).
// Without it, the tile opens the site in the browser.
const GROUPS = [
  {
    title: 'Listen',
    tools: [
      { id: 'radio', name: 'DGG Radio', sub: 'Music with chat, live on the dggjams Kick channel', action: 'radio' },
      {
        name: 'Radio lobby',
        sub: 'Queue songs on QueUp with the radio hosts',
        url: 'https://queup.net/join/dgg-radio',
        frame: true,
      },
    ],
  },
  {
    title: 'Look it up',
    tools: [
      { id: 'wiki', name: 'Destiny wiki', sub: 'Search people, memes, debates and lore', action: 'wiki' },
      {
        name: "Destiny's notes",
        sub: 'His positions and debate prep, from his Obsidian notebook',
        url: 'https://publish.obsidian.md/destiny/About',
        frame: true,
      },
    ],
  },
  {
    title: 'Chat history',
    tools: [
      {
        id: 'logs',
        name: 'Log search',
        sub: 'Search DGG chat by word, user or date (linkers.ooo)',
        url: 'https://linkers.ooo/logs',
        frame: true,
      },
      {
        name: 'Media feed',
        sub: 'Links and clips posted in chat, newest or most reacted',
        url: 'https://linkers.ooo/',
        frame: true,
      },
      {
        name: 'Emote stats',
        sub: 'Which emotes chat uses most, and who uses them',
        url: 'https://emotes.linkers.ooo/',
        frame: true,
      },
      { name: 'Leaderboards', sub: 'The most active chatters', url: 'https://linkers.ooo/leaderboards', frame: true },
      {
        name: 'RustleSearch',
        sub: 'Another chat log search, with user history',
        url: 'https://rustlesearch.dev/',
        frame: true,
      },
      {
        name: 'Mentions and conversations',
        sub: 'Messages that mention you, and talks between users (polecat.me)',
        url: 'https://polecat.me/',
      },
      {
        name: 'Chat stats',
        sub: 'Monthly activity, top chatters and words (vyneer)',
        url: 'https://vyneer.me/dggstats',
        frame: true,
      },
      {
        name: 'YEE vs PEPE polls',
        sub: 'Every chat poll, with votes over time',
        url: 'https://mitchdev.net/dgg/?sort=added&order=asc',
        frame: true,
      },
    ],
  },
  {
    title: 'VODs',
    tools: [
      {
        name: 'VODs with chat',
        sub: "Destiny's past streams with the chat replayed beside them",
        url: 'https://vyneer.me/vods/',
        frame: true,
      },
      {
        name: 'Stream archive',
        sub: 'Search past streams by what was said, with transcripts',
        url: 'https://dggvods.dev/',
        frame: true,
      },
    ],
  },
  {
    title: 'More',
    tools: [
      {
        name: 'The Pragmatic Papers',
        sub: 'The community-run political publication',
        url: 'https://pragmaticpapers.com/',
      },
      {
        name: 'DGG Tweaks',
        sub: 'A userscript for destiny.gg on a computer: mentions, links, Kick chat',
        url: 'https://yunidev-uk.github.io/userscripts/',
      },
    ],
  },
];

let page = 'home';
function show(name, title, openUrl) {
  page = name;
  $('#hub-home').hidden = name !== 'home';
  $('#hub-wiki').hidden = name !== 'wiki';
  $('#hub-view').hidden = name !== 'view';
  $('#hub-back').hidden = name === 'home';
  $('#hub-title').textContent = title || 'Community';
  $('#hub').classList.toggle('viewing', name === 'view');
  $('#hub-open').hidden = !openUrl;
  if (openUrl) $('#hub-open').href = openUrl;
  if (name !== 'view') $('#hub-frame').removeAttribute('src');
  $('#hub').scrollTop = 0;
}

function openTool(t) {
  if (t.action === 'radio') return playRadio();
  if (t.action === 'wiki') return openWiki();
  if (!t.frame) {
    window.open(t.url, '_blank', 'noopener');
    return;
  }
  show('view', t.name, t.url);
  $('#hub-frame').src = t.url;
}

// DGG Radio: the dggjams Kick channel, in the app's own player when it's live.
async function playRadio() {
  let live = true;
  try {
    const r = await fetch(`api/stream/kick/${RADIO.id}.m3u8`, { method: 'GET', cache: 'no-store' });
    live = r.status !== 404;
  } catch {}
  if (!live) {
    toast("DGG Radio isn't live right now. The lobby below has the queue.", 4000);
    return;
  }
  knownNames.set('kick/dggjams', 'DGG Radio');
  $('#hub').close();
  watch(RADIO);
}

function tileButton(t) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'row-btn';
  if (t.id) b.dataset.tool = t.id;
  const main = document.createElement('span');
  main.className = 'row-main';
  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = t.name;
  const sub = document.createElement('span');
  sub.className = 'row-sub';
  sub.textContent = t.sub;
  main.append(title, sub);
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('chev');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  // A chevron for what opens here, an arrow out for what opens in the browser.
  path.setAttribute(
    'd',
    t.frame || t.action
      ? 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z'
      : 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
  );
  icon.append(path);
  b.append(main, icon);
  b.addEventListener('click', () => openTool(t));
  return b;
}

function renderHome() {
  $('#hub-home').replaceChildren(
    ...GROUPS.map((g) => {
      const sec = document.createElement('section');
      sec.className = 'group';
      const h = document.createElement('h3');
      h.textContent = g.title;
      const card = document.createElement('div');
      card.className = 'card';
      card.append(...g.tools.map(tileButton));
      sec.append(h, card);
      return sec;
    }),
  );
}

// ---------- The wiki ----------
// MediaWiki's API answers any site (origin=*): opensearch for titles, then
// TextExtracts and PageImages for a summary card. The full page opens in the
// frame (the wiki's pages allow it; its API doesn't).

const api = (params) =>
  fetch(`${WIKI}/api.php?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`).then((r) => {
    if (!r.ok) throw new Error('wiki ' + r.status);
    return r.json();
  });

let searchSeq = 0;
async function search(q) {
  const seq = ++searchSeq;
  const box = $('#wiki-results');
  if (!q.trim()) {
    box.hidden = true;
    return;
  }
  try {
    const [, titles] = await api({ action: 'opensearch', search: q, limit: '8', namespace: '0' });
    if (seq !== searchSeq) return;
    box.replaceChildren(
      ...(titles.length
        ? titles.map((title) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'row-btn';
            const t = document.createElement('span');
            t.className = 'row-title';
            t.textContent = title;
            b.append(t);
            b.addEventListener('click', () => showArticle(title));
            return b;
          })
        : [
            Object.assign(document.createElement('p'), {
              className: 'hint',
              textContent: 'Nothing on the wiki by that name.',
            }),
          ]),
    );
    box.hidden = false;
  } catch {
    if (seq === searchSeq) toast("Couldn't reach the wiki.");
  }
}

async function summary(title) {
  const d = await api({
    action: 'query',
    prop: 'extracts|pageimages',
    exintro: '1',
    explaintext: '1',
    exsentences: '6',
    piprop: 'thumbnail',
    pithumbsize: '240',
    redirects: '1',
    titles: title,
  });
  const p = Object.values(d.query?.pages || {})[0];
  return p && !('missing' in p) ? p : null;
}

const pageUrl = (title) => `${WIKI}/view/${encodeURIComponent(title.replace(/ /g, '_'))}`;

async function showArticle(title, label) {
  const card = $('#wiki-card');
  try {
    const p = await summary(title);
    if (!p) {
      card.hidden = true;
      return false;
    }
    const parts = [];
    if (label) parts.push(Object.assign(document.createElement('p'), { className: 'wiki-label', textContent: label }));
    const head = document.createElement('div');
    head.className = 'wiki-head';
    if (p.thumbnail?.source?.startsWith('https://wikicdn.destiny.gg/')) {
      const img = document.createElement('img');
      img.src = p.thumbnail.source;
      img.alt = '';
      img.loading = 'lazy';
      head.append(img);
    }
    head.append(Object.assign(document.createElement('h3'), { textContent: p.title }));
    parts.push(head, Object.assign(document.createElement('p'), { textContent: p.extract || '' }));
    const more = document.createElement('div');
    more.className = 'links';
    const read = document.createElement('button');
    read.type = 'button';
    read.className = 'primary';
    read.textContent = 'Read the full page';
    read.addEventListener('click', () => {
      show('view', p.title, pageUrl(p.title));
      $('#hub-frame').src = pageUrl(p.title);
    });
    more.append(read);
    parts.push(more);
    card.replaceChildren(...parts);
    card.hidden = false;
    $('#wiki-results').hidden = true;
    return true;
  } catch {
    toast("Couldn't reach the wiki.");
    return false;
  }
}

function openWiki() {
  show('wiki', 'Destiny wiki');
  $('#wiki-card').hidden = true;
  $('#wiki-results').hidden = true;
  $('#wiki-q').value = '';
  // Whoever is on screen, if the wiki has a page on them.
  const now = state.current ? streamName(state.current) : '';
  if (now) showArticle(now, 'On screen now');
}

let typing = null;
$('#wiki-q').addEventListener('input', (e) => {
  clearTimeout(typing);
  typing = setTimeout(() => search(e.target.value), 250);
});
$('#wiki-q').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  clearTimeout(typing);
  search(e.target.value);
});

// ---------- Opening and closing ----------
export function openHub(to) {
  renderHome();
  show('home');
  $('#hub').showModal();
  if (to === 'wiki') openWiki();
}
$('#hub-btn').addEventListener('click', () => openHub());
$('#hub-back').addEventListener('click', () =>
  page === 'view' && !$('#wiki-card').hidden ? show('wiki', 'Destiny wiki') : show('home'),
);
$('#hub-close').addEventListener('click', () => $('#hub').close());
$('#hub').addEventListener('close', () => {
  $('#hub-frame').removeAttribute('src');
  $('#hub').classList.remove('viewing');
});
