'use strict';

// Serves the app from ./public and relays destiny.gg's live list of embeds
// (the channel tabs under the bigscreen player) to the app.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT) || 8080;
// Shown in the app's menu: the package version plus the deployed commit
// (Railway sets RAILWAY_GIT_COMMIT_SHA).
const VERSION = {
  version: require('./package.json').version,
  commit: (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || null,
};
const LIVE_URL = process.env.LIVE_URL || 'wss://live.destiny.gg';
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- Static files ----------
// Files are loaded into memory once (the container's files never change while
// it runs), compressed once, and served with ETags. The page refers to
// app.css, the JS modules and hls.js by content hash (app.css?v=…), so those
// can be cached for a year; a new deploy changes the hash. The service
// worker gets the list of those URLs to cache, and a cache name made from a
// hash of everything, so any change triggers the app's "update ready" prompt.

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.svg']);
const shortHash = (buf) => crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 10);

const raw = new Map(); // path -> { body, type, ext }
(function load(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      load(full);
      continue;
    }
    const ext = path.extname(entry.name);
    // public/js/package.json only tells Node (for the unit tests) that these are ES modules.
    if (!TYPES[ext] || entry.name === 'package.json') continue;
    const urlPath = '/' + path.relative(PUBLIC_DIR, full).split(path.sep).join('/');
    raw.set(urlPath, { body: fs.readFileSync(full), type: TYPES[ext], ext });
  }
})(PUBLIC_DIR);
const setText = (p, text) => {
  raw.get(p).body = Buffer.from(text);
};

// hls.js, served from here (pinned in package.json) instead of a CDN.
const HLS_VERSION = require('hls.js/package.json').version;
const HLS_PATH = `/vendor/hls-${HLS_VERSION}.min.js`;
raw.set(HLS_PATH, { body: fs.readFileSync(require.resolve('hls.js/dist/hls.min.js')), type: TYPES['.js'], ext: '.js' });

// The change log shown in the menu, from CHANGELOG.md:
//   ## 1.2.0 (2026-10-04)
//   - What changed
function parseChangelog(md) {
  const out = [];
  let cur = null;
  const clean = (t) => t.replace(/\*\*|`/g, '').trim();
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+\[?(\d+\.\d+\.\d+)\]?(?:\s*\(([^)]+)\))?/);
    if (h) {
      cur = { version: h[1], date: h[2] || null, items: [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const li = line.match(/^[-*]\s+(.+)/);
    if (li) cur.items.push(clean(li[1]));
    else if (/^\s{2,}\S/.test(line) && cur.items.length) cur.items[cur.items.length - 1] += ' ' + clean(line);
  }
  return out.filter((e) => e.items.length);
}
let changelog = [];
try {
  changelog = parseChangelog(fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8'));
} catch {}
raw.set('/changelog.json', { body: Buffer.from(JSON.stringify(changelog)), type: TYPES['.json'], ext: '.json' });

// Content-hashed URLs. The JS modules share one version (a hash of all of
// them), and their imports of each other carry it too.
const versions = new Map(); // path -> the ?v= that makes it immutable
const jsModules = [...raw.keys()].filter((p) => p.startsWith('/js/') && p.endsWith('.js')).sort();
const jsVersion = shortHash(Buffer.concat(jsModules.map((p) => raw.get(p).body)));
for (const p of jsModules) {
  setText(
    p,
    raw
      .get(p)
      .body.toString()
      .replace(/(\bfrom\s*|\bimport\s*)'(\.\/[\w-]+\.js)'/g, `$1'$2?v=${jsVersion}'`),
  );
  versions.set(p, jsVersion);
}
versions.set('/app.css', shortHash(raw.get('/app.css').body));
const versioned = (p) => `${p.slice(1)}?v=${versions.get(p)}`;

const preload = jsModules
  .filter((p) => p !== '/js/main.js')
  .map((p) => `  <link rel="modulepreload" href="${versioned(p)}">`)
  .join('\n');
setText(
  '/index.html',
  raw
    .get('/index.html')
    .body.toString()
    .replace('href="app.css"', `href="${versioned('/app.css')}"`)
    .replace('src="js/main.js"', `src="${versioned('/js/main.js')}"`)
    .replace('content="vendor/hls.min.js"', `content="${HLS_PATH.slice(1)}"`)
    .replace('<meta name="app-version" content="dev" />', `<meta name="app-version" content="${VERSION.version}" />`)
    .replace('</head>', `${preload}\n</head>`),
);

// What the service worker caches on install: the page, everything it uses,
// and the icons as the page and manifest refer to them.
const iconRefs = (p) =>
  raw
    .get(p)
    .body.toString()
    .match(/icons\/[\w.-]+\.png(\?v=\w+)?/g) || [];
const ASSETS = [
  './',
  versioned('/app.css'),
  ...jsModules.map(versioned),
  HLS_PATH.slice(1),
  'changelog.json',
  'manifest.webmanifest',
  ...new Set([...iconRefs('/index.html'), ...iconRefs('/manifest.webmanifest')]),
];
const buildHash = shortHash(Buffer.concat([...raw.entries()].filter(([p]) => p !== '/sw.js').map(([, f]) => f.body)));
setText(
  '/sw.js',
  raw
    .get('/sw.js')
    .body.toString()
    .replace(/const CACHE = '[^']*';/, `const CACHE = 'bdgg-${buildHash}';`)
    .replace(/const ASSETS = \[\];/, `const ASSETS = ${JSON.stringify(ASSETS)};`),
);

const files = new Map();
for (const [p, f] of raw) {
  const etag = shortHash(f.body);
  const file = { ...f, etag: `"${etag}"` };
  if (COMPRESSIBLE.has(f.ext)) {
    file.br = zlib.brotliCompressSync(f.body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
    file.gzip = zlib.gzipSync(f.body, { level: 9 });
  }
  files.set(p, file);
}
files.set('/', files.get('/index.html'));

function serveFile(req, res, url) {
  const file = files.get(url.pathname);
  if (!file) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  const v = url.searchParams.get('v');
  // Content-addressed URLs never change, so they can be cached for a year.
  const immutable = url.pathname === HLS_PATH || (!!v && v === versions.get(url.pathname));
  res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('Vary', 'Accept-Encoding');
  const accept = String(req.headers['accept-encoding'] || '');
  const enc = file.br && /\bbr\b/.test(accept) ? 'br' : file.gzip && /\bgzip\b/.test(accept) ? 'gzip' : null;
  const etag = enc ? file.etag.replace(/"$/, `-${enc}"`) : file.etag;
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304);
    return res.end();
  }
  const headers = { 'Content-Type': file.type };
  if (enc) headers['Content-Encoding'] = enc;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? '' : enc ? file[enc] : file.body);
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

// ---------- Per-visitor limits ----------
// Railway's edge puts the visitor's address in X-Real-IP.

function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
}

// Allows `limit` calls per key in each window.
function makeLimiter(limit, windowMs) {
  const hits = new Map(); // key -> { start, count }
  setInterval(() => {
    const now = Date.now();
    for (const [k, h] of hits) if (now - h.start > windowMs) hits.delete(k);
  }, windowMs).unref();
  return (k) => {
    const now = Date.now();
    let h = hits.get(k);
    if (!h || now - h.start > windowMs) {
      h = { start: now, count: 0 };
      hits.set(k, h);
    }
    h.count++;
    return h.count <= limit;
  };
}

// ---------- Content Security Policy ----------
// Only the sites the app actually uses. Kick's video comes from
// *.live-video.net (Amazon IVS); the other players are iframes. Violations are
// reported to /api/csp-report and logged (what was blocked, nothing about the
// visitor) so a missing site shows up in the logs.

// frame-src names destiny.gg's chat embed only (a CSP path is a prefix
// match, and it applies when a frame navigates): the chat's own "log in"
// link would otherwise take the frame to a destiny.gg page that refuses to
// be framed. chat.js catches the blocked navigation and opens a tab instead.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.youtube.com https://s.ytimg.com https://player.twitch.tv",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://images.kick.com https://clips.kick.com https://i.ytimg.com https://static-cdn.jtvnw.net https://thumbnail.angelthump.com",
  "media-src 'self' blob: data: https://*.live-video.net https://stream.kick.com https://clips.kick.com",
  "connect-src 'self' https://*.live-video.net https://stream.kick.com https://clips.kick.com",
  "worker-src 'self' blob:",
  'frame-src https://www.destiny.gg/embed/ https://player.kick.com https://player.twitch.tv https://clips.twitch.tv ' +
    'https://www.youtube.com https://www.youtube-nocookie.com https://rumble.com https://player.vimeo.com ' +
    'https://player.angelthump.com',
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'report-uri /api/csp-report',
].join('; ');

const cspReportLimit = makeLimiter(30, 10 * 60 * 1000);

function cspReport(req, res) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 10000) req.destroy();
  });
  req.on('end', () => {
    res.writeHead(204);
    res.end();
    if (!cspReportLimit('all')) return;
    try {
      const r = JSON.parse(body)['csp-report'] || {};
      const blocked = String(r['blocked-uri'] || '');
      let what = blocked;
      try {
        what = new URL(blocked).host || blocked;
      } catch {}
      const directive = String(r['effective-directive'] || r['violated-directive'] || '').split(' ')[0];
      console.log(`csp: blocked ${directive.slice(0, 40)} ${what.slice(0, 100)}`);
    } catch {}
  });
}

// ---------- Opt-in error reports ----------
// The app posts { kind, detail } when the person turned reports on in
// settings. They go to the log with the app version and the browser family,
// nothing that identifies the person.
const reportLimit = makeLimiter(20, 10 * 60 * 1000);
function browserFamily(ua) {
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'other';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung'
      : /Firefox/.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'other';
  return `${os}/${browser}`;
}
function errorReport(req, res) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 2000) req.destroy();
  });
  req.on('end', () => {
    res.writeHead(204);
    res.end();
    if (!reportLimit(clientIp(req))) return;
    try {
      const r = JSON.parse(body) || {};
      const kind = String(r.kind || '')
        .replace(/[^\w-]/g, '')
        .slice(0, 40);
      const detail = String(r.detail || '')
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 300);
      const version = String(r.version || '')
        .replace(/[^\w.]/g, '')
        .slice(0, 20);
      if (!kind) return;
      console.log(
        `report: ${kind} v${version || '?'} ${browserFamily(String(req.headers['user-agent'] || ''))} ${detail}`,
      );
    } catch {}
  });
}

// ---------- destiny.gg live feed ----------
// destiny.gg's bigscreen gets its list of embeds from this websocket. Each
// message is JSON like { type: 'dggApi:embeds', data: [...] }. We keep the
// latest of the types we use and hand them to the app over plain HTTP.

const live = {
  connected: false,
  embeds: null, // dggApi:embeds data, as sent
  streamInfo: null, // dggApi:streamInfo data, as sent
  banned: new Set(), // dggApi:bannedEmbeds, as "platform/name" in lower case
  hosting: null, // dggApi:hosting data, as sent (null when nobody is hosted)
  videos: null, // dggApi:videos: Destiny's latest YouTube videos
  kickVods: null, // dggApi:youtubeVods: Destiny's latest Kick VODs (the name is destiny.gg's)
};

let retryMs = 1000;
function connectLive() {
  // The browser version sends no special headers, and the server accepts a
  // connection without an Origin header.
  const ws = new WebSocket(LIVE_URL, { headers: { 'User-Agent': 'better-dgg' } });
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    try {
      ws.ping();
    } catch {}
  }, 30 * 1000);

  ws.on('open', () => {
    live.connected = true;
    retryMs = 1000;
    console.log('live: connected');
  });
  ws.on('pong', () => {
    alive = true;
  });
  ws.on('message', (raw) => {
    alive = true;
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'dggApi:embeds' && Array.isArray(msg.data)) {
      live.embeds = msg.data;
      broadcast();
    } else if (msg.type === 'dggApi:streamInfo') {
      live.streamInfo = msg.data;
      broadcast();
      pushOnStreamInfo();
    } else if (msg.type === 'dggApi:bannedEmbeds' && Array.isArray(msg.data)) {
      live.banned = bannedSet(msg.data);
      broadcast();
    } else if (msg.type === 'dggApi:hosting') {
      live.hosting = msg.data;
      broadcast();
    } else if (msg.type === 'dggApi:videos' && Array.isArray(msg.data)) {
      live.videos = msg.data;
      broadcast();
    } else if (msg.type === 'dggApi:youtubeVods' && Array.isArray(msg.data)) {
      live.kickVods = msg.data;
      broadcast();
    }
  });
  ws.on('unexpected-response', (_req, res) => console.log('live: refused with HTTP', res.statusCode));
  ws.on('error', (err) => console.log('live: error', err.message));
  ws.on('close', () => {
    clearInterval(heartbeat);
    live.connected = false;
    broadcast();
    console.log(`live: closed, retrying in ${retryMs / 1000}s`);
    setTimeout(connectLive, retryMs);
    retryMs = Math.min(retryMs * 2, 60 * 1000);
  });
}

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null);

// Live channels belong in the list, and YouTube videos (chatters embed
// those to watch together; `live` is false for them). Other platforms'
// VODs and clips don't.
const LIVE_PLATFORMS = new Set(['kick', 'twitch', 'youtube', 'angelthump', 'rumble']);

// Embeds destiny.gg's mods banned ({ platform, name, reason }) stay off the
// list, as on the bigscreen.
function bannedSet(list) {
  const out = new Set();
  for (const b of list) {
    const platform = str(b?.platform, 40);
    const name = str(b?.name, 120);
    if (platform && name) out.add(`${platform}/${name}`.toLowerCase());
  }
  return out;
}

function embedList() {
  return (live.embeds || [])
    .map((e) => {
      const id = e?.mediaItem?.identifier || {};
      const meta = e?.mediaItem?.metadata || {};
      // Only what the app shows. Viewer counts change constantly and would make
      // every update look like a new list.
      return {
        platform: str(id.platform || e.platform, 40),
        id: str(id.mediaId || e.id, 120),
        name: str(meta.displayName, 80),
        title: str(meta.title),
        preview: /^https:\/\//.test(meta.previewUrl || '') ? str(meta.previewUrl, 300) : null,
        live: meta.live === true,
      };
    })
    .filter((e) => e.platform && e.id && (e.live || e.platform === 'youtube') && LIVE_PLATFORMS.has(e.platform))
    .filter((e) => !live.banned.has(`${e.platform}/${e.id}`.toLowerCase()))
    .map(({ live: isLive, ...rest }) => (isLive ? rest : { ...rest, video: true }));
}

// The stream destiny.gg is hosting (dggApi:hosting), when there is one. The
// message's shape isn't documented; take a platform and an id or name from it.
function hostedStream() {
  const h = live.hosting;
  if (!h || typeof h !== 'object') return null;
  const platform = str(h.platform || h.mediaItem?.identifier?.platform, 40);
  const id = str(h.id || h.mediaId || h.name || h.mediaItem?.identifier?.mediaId, 120);
  if (!platform || !id || !LIVE_PLATFORMS.has(platform)) return null;
  return { platform, id, name: str(h.displayName || h.name || h.mediaItem?.metadata?.displayName, 80) || id };
}

// Destiny's latest videos (dggApi:videos, YouTube) and Kick VODs
// (dggApi:youtubeVods, despite the name), for when nothing of his is live.
// A Kick VOD's id is the one destiny.gg's bigscreen uses (#kick-vod/<channel>/<id>).
function latestVideos() {
  const out = [];
  for (const v of (live.videos || []).slice(0, 4)) {
    const id = str(v?.id, 20);
    if (id && /^[\w-]{11}$/.test(id))
      out.push({ platform: 'youtube', id, title: str(v.title, 120), thumb: str(v.mediumThumbnailUrl, 300) });
  }
  for (const v of (live.kickVods || []).slice(0, 4)) {
    const m = /^\/bigscreen#kick-vod\/([\w-]{1,64})\/([\da-f-]{36})$/.exec(str(v?.embedUrl, 200) || '');
    if (m && v.platform === 'kick') {
      out.push({
        platform: 'kick-vod',
        id: `${m[1]}/${m[2]}`,
        title: str(v.title, 120),
        thumb: str(v.mediumThumbnailUrl, 300),
        url: str(v.url, 200),
      });
    }
  }
  return out;
}

function snapshot() {
  return {
    connected: live.connected,
    destiny: destinyStreams(),
    hosting: hostedStream(),
    embeds: embedList(),
    videos: latestVideos(),
  };
}

// ---------- Server-sent events: push the list to every open app ----------

const MAX_LISTENERS = 5000;
const MAX_LISTENERS_PER_VISITOR = 10; // several tabs and devices behind one home connection
const listeners = new Set();
const listenersByIp = new Map(); // ip -> count
let lastSent = '';

function broadcast() {
  const body = JSON.stringify(snapshot());
  if (body === lastSent) return;
  lastSent = body;
  for (const res of listeners) res.write(`data: ${body}\n\n`);
}

function openStream(req, res) {
  if (listeners.size >= MAX_LISTENERS) {
    return send(res, 503, 'text/plain; charset=utf-8', 'Busy, try again later');
  }
  // The app falls back to polling /api/embeds when this is refused.
  const ip = clientIp(req);
  const open = listenersByIp.get(ip) || 0;
  if (open >= MAX_LISTENERS_PER_VISITOR) {
    return send(res, 429, 'text/plain; charset=utf-8', 'Too many open connections');
  }
  listenersByIp.set(ip, open + 1);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n');
  res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
  listeners.add(res);
  req.on('close', () => {
    listeners.delete(res);
    const n = (listenersByIp.get(ip) || 1) - 1;
    if (n > 0) listenersByIp.set(ip, n);
    else listenersByIp.delete(ip);
  });
}

// Keep idle connections from being closed by proxies along the way.
setInterval(() => {
  for (const res of listeners) res.write('event: ping\ndata: {}\n\n');
}, 25 * 1000).unref();

// Destiny's own streams, from dggApi:streamInfo: { streams: { kick, youtube, ... } }.
function destinyStreams() {
  const streams = live.streamInfo?.streams || {};
  const out = [];
  for (const [platform, s] of Object.entries(streams)) {
    if (!s || s.live !== true) continue;
    out.push({
      platform,
      id: str(s.id, 120),
      title: str(s.status_text),
    });
  }
  return out;
}

// ---------- Kick streams for the app's own player ----------
// Kick's public channel API gives each live channel an HLS playlist URL.
// Playing that in the app's own <video> keeps sound going when the phone
// locks and lets Chrome cast it. The top-level playlist doesn't always allow
// cross-site requests, so it's relayed from here; the media playlists and
// video segments it points to are fetched by the browser directly.

const KICK_SLUG = /^[A-Za-z0-9_-]{1,64}$/;
const kickCache = new Map(); // slug -> { at, url }
const inFlight = new Map(); // key -> promise, so viewers asking at once share one request

function shared(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const p = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

function kickPlaybackUrl(slug) {
  const hit = kickCache.get(slug);
  if (hit && Date.now() - hit.at < 30 * 1000) return Promise.resolve(hit.url);
  return shared('api:' + slug, () => lookupKick(slug));
}

async function lookupKick(slug) {
  const r = await fetch(`https://kick.com/api/v2/channels/${slug}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; better-dgg)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('kick api ' + r.status);
  const j = await r.json();
  const url = j && j.livestream && typeof j.playback_url === 'string' ? j.playback_url : null;
  kickCache.set(slug, { at: Date.now(), url });
  if (kickCache.size > 500) kickCache.delete(kickCache.keys().next().value);
  return url;
}

// Make every URI in a playlist absolute so it still resolves when served from here.
function rewriteMaster(text, url) {
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (t && !t.startsWith('#')) return new URL(t, url).toString();
      return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${new URL(u, url).toString()}"`);
    })
    .join('\n');
}

// The master playlist only lists the quality levels, so a few seconds of
// sharing between viewers is safe.
const masterCache = new Map(); // slug -> { at, text }
function kickMaster(slug, url) {
  const hit = masterCache.get(slug);
  if (hit && Date.now() - hit.at < 5000) return Promise.resolve(hit.text);
  return shared('master:' + slug, async () => {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('upstream ' + r.status);
    const text = await r.text();
    if (!text.startsWith('#EXTM3U')) throw new Error('bad playlist');
    const out = rewriteMaster(text, url);
    masterCache.set(slug, { at: Date.now(), text: out });
    if (masterCache.size > 500) masterCache.delete(masterCache.keys().next().value);
    return out;
  });
}

// Each viewer gets a generous number of lookups a minute (a player asks twice
// per start), so the relay can't be used as a free proxy for Kick's API.
const kickLimit = makeLimiter(120, 60 * 1000);

async function serveKickPlaylist(req, res, slug) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!kickLimit(clientIp(req))) {
    res.setHeader('Retry-After', '60');
    return send(res, 429, 'text/plain; charset=utf-8', 'Too many requests, try again in a minute');
  }
  if (!KICK_SLUG.test(slug)) return send(res, 400, 'text/plain; charset=utf-8', 'Bad channel');
  try {
    const key = slug.toLowerCase();
    const url = await kickPlaybackUrl(key);
    if (!url) return send(res, 404, 'text/plain; charset=utf-8', 'Not live');
    const out = await kickMaster(key, url);
    send(res, 200, 'application/vnd.apple.mpegurl', out);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.log(`kick: ${slug} ${msg}`);
    // Kick lists the stream live but its video is gone for the moment (a
    // restart, seen when several streams dropped at once): worth asking
    // again shortly, which the app does.
    if (msg === 'upstream 404') {
      res.setHeader('Retry-After', '6');
      return send(res, 503, 'text/plain; charset=utf-8', 'Stream restarting');
    }
    send(res, 502, 'text/plain; charset=utf-8', 'Kick unavailable');
  }
}

// Kick VODs and clips: the browser can fetch their playlists and video
// itself (they allow any origin), but finding the playlist takes Kick's API,
// which doesn't, so the lookup and the top playlist come from here. A VOD's
// id is the uuid destiny.gg's bigscreen uses (#kick-vod/<channel>/<uuid>);
// a clip's is its clip_... id.
const KICK_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/;
const KICK_CLIP = /^clip_[A-Z0-9]{10,40}$/;
const vodCache = new Map(); // id -> { at, url }

// Kick has two ids for a VOD: the one its API and destiny.gg use, and the
// one in the page's address (kick.com/<channel>/videos/<id>), which the API
// doesn't know. For the second kind the VOD page itself carries the playlist
// address in its data, so that is where it comes from.
const VOD_SOURCE = /["\\]*recording_url["\\]*:["\\]*(https:\/\/stream\.kick\.com\/[^"\\]+\.m3u8)/;
async function kickVodUrl(channel, uuid) {
  const hit = vodCache.get('vod:' + uuid);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.url;
  return shared('vod:' + uuid, async () => {
    const r = await fetch(`https://kick.com/api/v1/video/${uuid}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; better-dgg)' },
      signal: AbortSignal.timeout(8000),
    });
    let url = null;
    if (r.ok) {
      const j = await r.json();
      url = typeof j?.source === 'string' && /^https:\/\//.test(j.source) ? j.source : null;
    } else if (r.status === 404 && channel) {
      const page = await fetch(`https://kick.com/${encodeURIComponent(channel)}/videos/${uuid}`, {
        headers: { Accept: 'text/html', 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(8000),
      });
      if (page.ok) {
        const m = VOD_SOURCE.exec(await page.text());
        if (m) url = m[1];
      } else if (page.status !== 404) throw new Error('kick page ' + page.status);
    } else throw new Error('kick api ' + r.status);
    vodCache.set('vod:' + uuid, { at: Date.now(), url });
    if (vodCache.size > 500) vodCache.delete(vodCache.keys().next().value);
    return url;
  });
}

async function kickClipUrl(id) {
  const hit = vodCache.get('clip:' + id);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.url;
  return shared('clip:' + id, async () => {
    const r = await fetch(`https://kick.com/api/v2/clips/${id}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; better-dgg)' },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('kick api ' + r.status);
    const j = await r.json();
    const u = j?.clip?.video_url || j?.clip?.clip_url;
    const url = typeof u === 'string' && /^https:\/\/clips\.kick\.com\//.test(u) ? u : null;
    vodCache.set('clip:' + id, { at: Date.now(), url });
    if (vodCache.size > 500) vodCache.delete(vodCache.keys().next().value);
    return url;
  });
}

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

async function serveKickVideo(req, res, kind, channel, id) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!kickLimit(clientIp(req))) {
    res.setHeader('Retry-After', '60');
    return send(res, 429, 'text/plain; charset=utf-8', 'Too many requests, try again in a minute');
  }
  if (kind === 'kick-vod' ? !KICK_UUID.test(id) || !KICK_SLUG.test(channel || '') : !KICK_CLIP.test(id)) {
    return send(res, 400, 'text/plain; charset=utf-8', 'Bad id');
  }
  try {
    const url = kind === 'kick-vod' ? await kickVodUrl(channel, id) : await kickClipUrl(id);
    if (!url) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
    const out = await kickMaster(`${kind}:${id}`, url);
    send(res, 200, 'application/vnd.apple.mpegurl', out);
  } catch (e) {
    console.log(`kick: ${kind} ${id} ${e && e.message ? e.message : e}`);
    send(res, 502, 'text/plain; charset=utf-8', 'Kick unavailable');
  }
}

// ---------- Web push: "Destiny is live" ----------
// The VAPID keys live in the environment (VAPID_PUBLIC, VAPID_PRIVATE and
// VAPID_SUBJECT, a contact URL), never in the repo; without them the feature
// is off and /api/push/key answers 404. Subscriptions are kept in PUSH_FILE
// (a Railway volume at /data) so they survive a deploy, and in memory when
// that file can't be written. A platform of Destiny's going from not live
// to live in dggApi:streamInfo sends one notification per platform per 10
// minutes; the first streamInfo after a start is a baseline, not news, so a
// deploy while he's live doesn't notify everyone.
const pushFile = () => process.env.PUSH_FILE || '/data/push.json';
const PUSH_MAX = 5000;
const push = {
  subs: new Map(), // endpoint -> subscription
  live: null, // platforms live at the last streamInfo; null until the first one
  sentAt: new Map(), // platform -> when it was last announced
  sender: null, // (subscription, payload) => Promise; web-push, or a test's stand-in
  config() {
    const pub = process.env.VAPID_PUBLIC;
    const priv = process.env.VAPID_PRIVATE;
    return pub && priv ? { pub, priv, subject: process.env.VAPID_SUBJECT || 'https://mobile-dgg.com' } : null;
  },
};
const validSub = (x) =>
  !!x &&
  typeof x.endpoint === 'string' &&
  /^https:\/\/\S{1,1000}$/.test(x.endpoint) &&
  !!x.keys &&
  typeof x.keys.p256dh === 'string' &&
  typeof x.keys.auth === 'string' &&
  x.keys.p256dh.length <= 200 &&
  x.keys.auth.length <= 100;

function loadPush() {
  try {
    const list = JSON.parse(fs.readFileSync(pushFile(), 'utf8'));
    for (const x of Array.isArray(list) ? list : []) if (validSub(x)) push.subs.set(x.endpoint, x);
    if (push.subs.size) console.log(`push: ${push.subs.size} subscriptions loaded`);
  } catch {}
}
let pushSaveTimer = null;
function savePush() {
  clearTimeout(pushSaveTimer);
  pushSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(pushFile()), { recursive: true });
      fs.writeFileSync(pushFile() + '.tmp', JSON.stringify([...push.subs.values()]));
      fs.renameSync(pushFile() + '.tmp', pushFile());
    } catch (e) {
      console.log('push: save failed', e.message);
    }
  }, 500);
  pushSaveTimer.unref();
}
function sendPush(sub, payload) {
  if (!push.sender) {
    const webpush = require('web-push');
    const c = push.config();
    webpush.setVapidDetails(c.subject, c.pub, c.priv);
    push.sender = (s, p) => webpush.sendNotification(s, p, { TTL: 600 });
  }
  return push.sender(sub, payload);
}
const PLATFORM_LABEL = { kick: 'Kick', youtube: 'YouTube', rumble: 'Rumble', twitch: 'Twitch' };
async function notifyLive(stream) {
  if (!push.config() || !push.subs.size) return;
  const { platform, id, title } = stream;
  const hash = platform === 'kick' ? '#kick/destiny' : id ? `#${platform}/${id}` : '';
  const payload = JSON.stringify({
    title: `Destiny is live on ${PLATFORM_LABEL[platform] || platform}`,
    body: title || '',
    url: hash || './',
    tag: 'live',
  });
  let sent = 0;
  let dropped = 0;
  const all = [...push.subs.values()];
  for (let i = 0; i < all.length; i += 20) {
    await Promise.all(
      all.slice(i, i + 20).map(async (sub) => {
        try {
          await sendPush(sub, payload);
          sent++;
        } catch (e) {
          const code = e && e.statusCode;
          if (code === 404 || code === 410) {
            push.subs.delete(sub.endpoint);
            dropped++;
          } else console.log('push: failed', code || (e && e.message) || e);
        }
      }),
    );
  }
  if (dropped) savePush();
  console.log(`push: ${platform} live, sent ${sent}, dropped ${dropped}`);
}
function pushOnStreamInfo() {
  const streams = destinyStreams();
  const now = new Set(streams.map((s) => s.platform));
  const before = push.live;
  push.live = now;
  if (!before) return;
  const promises = [];
  for (const s of streams) {
    if (before.has(s.platform)) continue;
    if (Date.now() - (push.sentAt.get(s.platform) || 0) < 10 * 60 * 1000) continue;
    push.sentAt.set(s.platform, Date.now());
    promises.push(notifyLive(s).catch((e) => console.log('push: error', e && e.message)));
  }
  return Promise.all(promises);
}

function readJson(req, max = 4000) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > max) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}
const pushLimit = makeLimiter(20, 10 * 60 * 1000);
async function pushSubscribe(req, res, on) {
  res.setHeader('Cache-Control', 'no-store');
  if (!pushLimit(clientIp(req))) return send(res, 429, 'text/plain; charset=utf-8', 'Too many requests');
  const body = await readJson(req);
  if (on) {
    const sub = body && body.subscription;
    if (!push.config()) return send(res, 404, 'text/plain; charset=utf-8', 'Notifications are off');
    if (!validSub(sub)) return send(res, 400, 'text/plain; charset=utf-8', 'Bad subscription');
    if (!push.subs.has(sub.endpoint) && push.subs.size >= PUSH_MAX) {
      return send(res, 503, 'text/plain; charset=utf-8', 'Full');
    }
    push.subs.set(sub.endpoint, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  } else {
    const endpoint = body && body.endpoint;
    if (typeof endpoint !== 'string') return send(res, 400, 'text/plain; charset=utf-8', 'Bad request');
    push.subs.delete(endpoint);
  }
  savePush();
  res.writeHead(204);
  res.end();
}

// ---------- Chat events: a SwitchBot button ----------
// A SwitchBot Bot (the button pusher) presses a real button when something
// happens in destiny.gg chat: a donation by default, or any of the
// SWITCHBOT_EVENTS (donation, subscription, giftsub, massgift, comma
// separated; SWITCHBOT_MIN_AMOUNT is a dollar floor for donations). It goes
// through the SwitchBot cloud API, which needs a SwitchBot hub, the token and
// secret from the SwitchBot app's developer options (SWITCHBOT_TOKEN and
// SWITCHBOT_SECRET, never in the repo) and the Bot's id (SWITCHBOT_DEVICE;
// scripts/switchbot-devices.js lists them). Without those the feature is off
// and the chat socket isn't opened. The chat sends `TYPE {json}` lines;
// anonymous connections see donations and subscriptions like everyone else.
// Presses go one at a time, 3 s apart (a press takes about that long), with
// at most 20 waiting; a failed press is logged and the next one still goes.
const CHAT_URL = process.env.CHAT_URL || 'wss://chat.destiny.gg/ws';
const SWITCHBOT_API = 'https://api.switch-bot.com/v1.1';
const CHAT_EVENTS = { donation: 'DONATION', subscription: 'SUBSCRIPTION', giftsub: 'GIFTSUB', massgift: 'MASSGIFT' };
const switchbot = {
  queue: [], // reasons waiting for a press
  draining: null, // the promise working through the queue, while there is one
  pressed: 0,
  gapMs: 3000,
  sender: null, // (reason) => Promise; the SwitchBot API, or a test's stand-in
  config() {
    const { SWITCHBOT_TOKEN: token, SWITCHBOT_SECRET: secret, SWITCHBOT_DEVICE: device } = process.env;
    if (!token || !secret || !device) return null;
    const events = (process.env.SWITCHBOT_EVENTS || 'donation')
      .toLowerCase()
      .split(',')
      .map((e) => e.trim())
      .filter((e) => CHAT_EVENTS[e]);
    const minAmount = Number(process.env.SWITCHBOT_MIN_AMOUNT) || 0;
    return { token, secret, device, events, command: process.env.SWITCHBOT_COMMAND || 'press', minAmount };
  },
};

function parseChatMessage(raw) {
  const text = String(raw);
  const space = text.indexOf(' ');
  if (space < 1) return null;
  const type = text.slice(0, space);
  if (!/^[A-Z]{1,20}$/.test(type)) return null;
  let data;
  try {
    data = JSON.parse(text.slice(space + 1));
  } catch {
    return null;
  }
  return data && typeof data === 'object' ? { type, data } : null;
}

// What a chat event is, in words for the log, or null when it's not one the
// button is set to answer. Donation amounts are in cents, as chat-gui shows
// them.
function chatEvent(cfg, type, data) {
  const name = Object.keys(CHAT_EVENTS).find((k) => CHAT_EVENTS[k] === type);
  if (!name || !cfg.events.includes(name)) return null;
  const nick = str(data.nick, 40) || 'someone';
  if (type === 'DONATION') {
    const dollars = (Number(data.amount) || 0) / 100;
    if (dollars < cfg.minAmount) return null;
    return `donation of $${dollars.toFixed(2)} by ${nick}`;
  }
  if (type === 'SUBSCRIPTION') return `subscription by ${nick}${data.tierLabel ? ` (${str(data.tierLabel, 40)})` : ''}`;
  if (type === 'GIFTSUB') return `gift sub from ${nick} to ${str(data.giftee, 40) || 'someone'}`;
  return `${Number(data.quantity) || 'some'} gift subs from ${nick}`;
}

// Returns true when the message queued a press.
function onChatMessage(raw) {
  const cfg = switchbot.config();
  if (!cfg) return false;
  const msg = parseChatMessage(raw);
  if (!msg) return false;
  const reason = chatEvent(cfg, msg.type, msg.data);
  if (!reason) return false;
  pressButton(reason);
  return true;
}

function pressButton(reason) {
  if (switchbot.queue.length >= 20) {
    console.log(`switchbot: queue full, skipped ${reason}`);
    return switchbot.draining;
  }
  switchbot.queue.push(reason);
  if (!switchbot.draining) switchbot.draining = drainPresses().finally(() => (switchbot.draining = null));
  return switchbot.draining;
}
async function drainPresses() {
  while (switchbot.queue.length) {
    const reason = switchbot.queue.shift();
    try {
      await (switchbot.sender || sendSwitchbot)(reason);
      switchbot.pressed++;
      console.log(`switchbot: pressed for ${reason}`);
    } catch (e) {
      console.log(`switchbot: failed for ${reason}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, switchbot.gapMs));
  }
}

// SwitchBot API v1.1: each request is signed with the secret over
// token + timestamp + nonce, and a 2xx answer still carries its own
// statusCode (100 is success; 161 is the Bot offline, 171 the hub).
async function sendSwitchbot() {
  const cfg = switchbot.config();
  if (!cfg) throw new Error('not configured');
  const t = String(Date.now());
  const nonce = crypto.randomUUID();
  const sign = crypto
    .createHmac('sha256', cfg.secret)
    .update(cfg.token + t + nonce)
    .digest('base64')
    .toUpperCase();
  const res = await fetch(`${SWITCHBOT_API}/devices/${encodeURIComponent(cfg.device)}/commands`, {
    method: 'POST',
    headers: { Authorization: cfg.token, sign, t, nonce, 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandType: 'command', command: cfg.command, parameter: 'default' }),
    signal: AbortSignal.timeout(15000),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!body || body.statusCode !== 100) {
    throw new Error(body ? `SwitchBot answered ${body.statusCode} ${body.message || ''}`.trim() : 'unreadable answer');
  }
}

let chatRetryMs = 1000;
function connectChat() {
  const ws = new WebSocket(CHAT_URL, { headers: { 'User-Agent': 'better-dgg' } });
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    try {
      ws.ping();
    } catch {}
  }, 30 * 1000);
  ws.on('open', () => {
    chatRetryMs = 1000;
    console.log('chat: connected');
  });
  ws.on('pong', () => {
    alive = true;
  });
  ws.on('message', (raw) => {
    alive = true;
    onChatMessage(raw.toString());
  });
  ws.on('unexpected-response', (_req, res) => console.log('chat: refused with HTTP', res.statusCode));
  ws.on('error', (err) => console.log('chat: error', err.message));
  ws.on('close', () => {
    clearInterval(heartbeat);
    console.log(`chat: closed, retrying in ${chatRetryMs / 1000}s`);
    setTimeout(connectChat, chatRetryMs);
    chatRetryMs = Math.min(chatRetryMs * 2, 60 * 1000);
  });
}

// ---------- HTTP ----------

const server = http.createServer((req, res) => {
  try {
    handle(req, res);
  } catch {
    // A malformed request (a bad URL or percent-encoding) must never take
    // the server down for everyone.
    if (res.headersSent) res.end();
    else send(res, 400, 'text/plain; charset=utf-8', 'Bad request');
  }
});

function handle(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CSP);
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/csp-report') return cspReport(req, res);
  if (req.method === 'POST' && url.pathname === '/api/report') return errorReport(req, res);
  if (req.method === 'POST' && url.pathname === '/api/push/subscribe') return pushSubscribe(req, res, true);
  if (req.method === 'POST' && url.pathname === '/api/push/unsubscribe') return pushSubscribe(req, res, false);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed');
  }
  if (url.pathname === '/api/embeds') {
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, 'application/json', JSON.stringify(snapshot()));
  }
  if (url.pathname === '/api/live') return openStream(req, res);
  if (url.pathname === '/api/push/key') {
    res.setHeader('Cache-Control', 'no-store');
    const c = push.config();
    if (!c) return send(res, 404, 'text/plain; charset=utf-8', 'Notifications are off');
    return send(res, 200, 'application/json', JSON.stringify({ key: c.pub }));
  }
  if (url.pathname === '/api/version') {
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, 'application/json', JSON.stringify(VERSION));
  }
  const kick = url.pathname.match(/^\/api\/stream\/kick\/([^/]+)\.m3u8$/);
  if (kick) return serveKickPlaylist(req, res, decodeURIComponent(kick[1]));
  // A VOD's app id is <channel>/<uuid>.
  const video = url.pathname.match(/^\/api\/stream\/(kick-vod|kick-clip)\/(?:([^/]+)\/)?([^/]+)\.m3u8$/);
  if (video) {
    return serveKickVideo(
      req,
      res,
      video[1],
      video[2] ? decodeURIComponent(video[2]) : '',
      decodeURIComponent(video[3]),
    );
  }
  if (url.pathname === '/healthz') return send(res, 200, 'text/plain', 'ok');
  // The manifest's share target: the app reads ?url= and ?text= itself.
  if (url.pathname === '/share') url.pathname = '/';
  serveFile(req, res, url);
}

function start() {
  server.listen(PORT, () => console.log(`listening on ${PORT}`));

  // On redeploy Railway sends SIGTERM. Tell open apps to reconnect in a second
  // (to the new server) instead of waiting out their usual retry delay.
  process.on('SIGTERM', () => {
    console.log('shutting down');
    for (const res of listeners) {
      try {
        res.end('retry: 1000\n\n');
      } catch {}
    }
    server.close();
    setTimeout(() => process.exit(0), 2000).unref();
  });
  loadPush();
  if (push.config()) console.log('push: on');
  const sb = switchbot.config();
  if (sb) console.log(`switchbot: on (${sb.events.join(', ') || 'no events'}; ${sb.command})`);
  if (process.env.NO_LIVE !== '1') {
    connectLive();
    if (sb) connectChat();
  }
}

if (require.main === module) start();

// For the unit tests in test/.
module.exports = {
  server,
  live,
  broadcast,
  embedList,
  destinyStreams,
  snapshot,
  rewriteMaster,
  parseChangelog,
  makeLimiter,
  files,
  ASSETS,
  CSP,
  kickCache,
  masterCache,
  push,
  pushOnStreamInfo,
  switchbot,
  parseChatMessage,
  onChatMessage,
  pressButton,
};
