'use strict';

// Serves the app from ./public and relays destiny.gg's live list of embeds
// (the channel tabs under the bigscreen player) to the app.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const LIVE_URL = process.env.LIVE_URL || 'wss://live.destiny.gg';
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- Static files ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// The container's files never change while it runs, so load them once.
const files = new Map();
(function load(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { load(full); continue; }
    const type = TYPES[path.extname(entry.name)];
    if (!type) continue;
    const body = fs.readFileSync(full);
    const etag = '"' + crypto.createHash('sha1').update(body).digest('base64url') + '"';
    files.set('/' + path.relative(PUBLIC_DIR, full).split(path.sep).join('/'), { body, type, etag });
  }
})(PUBLIC_DIR);
files.set('/', files.get('/index.html'));

function serveFile(req, res, pathname) {
  const file = files.get(pathname);
  if (!file) return send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('ETag', file.etag);
  if (req.headers['if-none-match'] === file.etag) {
    res.writeHead(304);
    return res.end();
  }
  send(res, 200, file.type, req.method === 'HEAD' ? '' : file.body);
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

// ---------- destiny.gg live feed ----------
// destiny.gg's bigscreen gets its list of embeds from this websocket. Each
// message is JSON like { type: 'dggApi:embeds', data: [...] }. We keep the
// latest of the types we use and hand them to the app over plain HTTP.

const live = {
  connected: false,
  embeds: null, // dggApi:embeds data, as sent
  embedsAt: 0,
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
    try { ws.ping(); } catch {}
  }, 30 * 1000);

  ws.on('open', () => {
    live.connected = true;
    retryMs = 1000;
    console.log('live: connected');
  });
  ws.on('pong', () => { alive = true; });
  ws.on('message', (raw) => {
    alive = true;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'dggApi:embeds' && Array.isArray(msg.data)) {
      live.embeds = msg.data;
      live.embedsAt = Date.now();
    } else if (msg.type === 'dggApi:streamInfo') {
      live.streamInfo = msg.data;
    }
  });
  ws.on('unexpected-response', (_req, res) => console.log('live: refused with HTTP', res.statusCode));
  ws.on('error', (err) => console.log('live: error', err.message));
  ws.on('close', () => {
    clearInterval(heartbeat);
    live.connected = false;
    console.log(`live: closed, retrying in ${retryMs / 1000}s`);
    setTimeout(connectLive, retryMs);
    retryMs = Math.min(retryMs * 2, 60 * 1000);
  });
}

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function embedList() {
  return (live.embeds || []).map((e) => {
    const id = e?.mediaItem?.identifier || {};
    const meta = e?.mediaItem?.metadata || {};
    return {
      platform: str(id.platform || e.platform, 40),
      id: str(id.mediaId || e.id, 120),
      count: num(e.count),
      name: str(meta.displayName, 80),
      title: str(meta.title),
      live: meta.live === true,
      viewers: num(meta.viewers),
      preview: str(meta.previewUrl, 500),
    };
  }).filter((e) => e.platform && e.id);
}

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
      viewers: num(s.viewers),
    });
  }
  return out;
}

// ---------- HTTP ----------

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed');
  }
  if (url.pathname === '/api/embeds') {
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, 'application/json', JSON.stringify({
      connected: live.connected,
      updated: live.embedsAt || null,
      destiny: destinyStreams(),
      embeds: embedList(),
    }));
  }
  if (url.pathname === '/healthz') return send(res, 200, 'text/plain', 'ok');
  serveFile(req, res, url.pathname);
});

server.listen(PORT, () => console.log(`listening on ${PORT}`));
if (process.env.NO_LIVE !== '1') connectLive();
