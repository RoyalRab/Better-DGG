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

// Android: Chrome draws a page that asks for viewport-fit=cover behind the
// navigation buttons, and the installed app doesn't reliably report how tall
// they are, so the bottom of chat ended up underneath them. Without it,
// Chrome keeps the page above them. iPhones keep it, for the notch.
raw.set('/index-android.html', {
  ...raw.get('/index.html'),
  body: Buffer.from(raw.get('/index.html').body.toString().replace(', viewport-fit=cover', '')),
});

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
  const page = url.pathname === '/' || url.pathname === '/index.html';
  const android = page && /Android/i.test(String(req.headers['user-agent'] || ''));
  const file = files.get(android ? '/index-android.html' : url.pathname);
  if (!file) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  const v = url.searchParams.get('v');
  // Content-addressed URLs never change, so they can be cached for a year.
  const immutable = url.pathname === HLS_PATH || (!!v && v === versions.get(url.pathname));
  res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.setHeader('Vary', page ? 'Accept-Encoding, User-Agent' : 'Accept-Encoding');
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

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.youtube.com https://s.ytimg.com https://player.twitch.tv",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self' blob: data: https://*.live-video.net",
  "connect-src 'self' https://*.live-video.net",
  "worker-src 'self' blob:",
  'frame-src https://www.destiny.gg https://player.kick.com https://player.twitch.tv https://clips.twitch.tv ' +
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

// ---------- destiny.gg live feed ----------
// destiny.gg's bigscreen gets its list of embeds from this websocket. Each
// message is JSON like { type: 'dggApi:embeds', data: [...] }. We keep the
// latest of the types we use and hand them to the app over plain HTTP.

const live = {
  connected: false,
  embeds: null, // dggApi:embeds data, as sent
  streamInfo: null, // dggApi:streamInfo data, as sent
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

// Only live channels belong in the list; VODs, clips and ordinary videos don't.
const LIVE_PLATFORMS = new Set(['kick', 'twitch', 'youtube', 'angelthump', 'rumble']);

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
        live: meta.live === true,
      };
    })
    .filter((e) => e.platform && e.id && e.live && LIVE_PLATFORMS.has(e.platform))
    .map(({ live: _live, ...rest }) => rest);
}

function snapshot() {
  return {
    connected: live.connected,
    destiny: destinyStreams(),
    embeds: embedList(),
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

// Each viewer gets a generous number of lookups a minute (a player asks once
// per start), so the relay can't be used as a free proxy for Kick's API.
const kickLimit = makeLimiter(60, 60 * 1000);

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
  } catch {
    send(res, 502, 'text/plain; charset=utf-8', 'Kick unavailable');
  }
}

// ---------- HTTP ----------

const server = http.createServer((req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CSP);
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/csp-report') return cspReport(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed');
  }
  if (url.pathname === '/api/embeds') {
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, 'application/json', JSON.stringify(snapshot()));
  }
  if (url.pathname === '/api/live') return openStream(req, res);
  if (url.pathname === '/api/version') {
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, 'application/json', JSON.stringify(VERSION));
  }
  const kick = url.pathname.match(/^\/api\/stream\/kick\/([^/]+)\.m3u8$/);
  if (kick) return serveKickPlaylist(req, res, decodeURIComponent(kick[1]));
  if (url.pathname === '/healthz') return send(res, 200, 'text/plain', 'ok');
  serveFile(req, res, url);
});

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
  if (process.env.NO_LIVE !== '1') connectLive();
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
};
