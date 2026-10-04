'use strict';

// Serves the app from ./public and keeps a live list of the embeds people
// are posting in destiny.gg chat (the #kick/name style links), which the app
// shows as its embed list.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const CHAT_URL = process.env.CHAT_URL || 'wss://chat.destiny.gg/ws';
const PUBLIC_DIR = path.join(__dirname, 'public');
const KEEP_MS = 2 * 60 * 60 * 1000;

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

// ---------- Chat embed collector ----------

// Same pattern destiny.gg chat uses to turn #platform/id into bigscreen links.
const EMBED_RE =
  /(?:^|\s)#(kick|kick-vod|twitch|twitch-vod|twitch-clip|youtube|youtube-live|facebook|rumble|vimeo|angelthump)\/([\w\d]{3,64}\/videos\/\d{10,20}|[\w-]{3,64}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[\w-]{3,64}|\w{7}\/\?pub=\w{5})(?:\?t=(\d+)s?)?\b/g;
const CASE_INSENSITIVE = new Set(['kick', 'twitch', 'angelthump']);

const posts = []; // { at, key, platform, id, nick }
const chat = { connected: false, since: 0, lastMessageAt: 0 };

function normalize(platform, id) {
  if (platform === 'rumble') id = id.replace(/\/\?pub=\w+$/, '');
  if (CASE_INSENSITIVE.has(platform)) id = id.toLowerCase();
  return id;
}

function recordMessage(msg) {
  if (!msg || typeof msg.data !== 'string') return;
  const at = Date.now();
  const seen = new Set();
  for (const m of msg.data.matchAll(EMBED_RE)) {
    const platform = m[1];
    const id = normalize(platform, m[2]);
    const key = `${platform}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    posts.push({ at, key, platform, id, nick: String(msg.nick || '') });
  }
}

function prune() {
  const cutoff = Date.now() - KEEP_MS;
  let i = 0;
  while (i < posts.length && posts[i].at < cutoff) i++;
  if (i) posts.splice(0, i);
}
setInterval(prune, 60 * 1000).unref();

function topEmbeds(minutes, limit) {
  const cutoff = Date.now() - minutes * 60 * 1000;
  const byKey = new Map();
  for (const p of posts) {
    if (p.at < cutoff) continue;
    let e = byKey.get(p.key);
    if (!e) {
      e = { key: p.key, platform: p.platform, id: p.id, users: new Set(), posts: 0, lastPosted: 0 };
      byKey.set(p.key, e);
    }
    e.users.add(p.nick.toLowerCase());
    e.posts++;
    e.lastPosted = Math.max(e.lastPosted, p.at);
  }
  return [...byKey.values()]
    .map((e) => ({
      key: e.key,
      platform: e.platform,
      id: e.id,
      count: e.users.size,
      posts: e.posts,
      lastPosted: e.lastPosted,
      title: titles.get(e.key) || null,
    }))
    .sort((a, b) => b.count - a.count || b.lastPosted - a.lastPosted)
    .slice(0, limit);
}

let retryMs = 1000;
function connectChat() {
  // No Origin header: the chat server only checks it when one is sent.
  const ws = new WebSocket(CHAT_URL, { headers: { 'User-Agent': 'better-dgg (embed list)' } });
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    try { ws.ping(); } catch {}
  }, 30 * 1000);

  ws.on('open', () => {
    chat.connected = true;
    chat.since = Date.now();
    retryMs = 1000;
    console.log('chat: connected');
  });
  ws.on('pong', () => { alive = true; });
  ws.on('message', (raw) => {
    alive = true;
    chat.lastMessageAt = Date.now();
    const text = raw.toString();
    const space = text.indexOf(' ');
    if (space < 0 || text.slice(0, space) !== 'MSG') return;
    try { recordMessage(JSON.parse(text.slice(space + 1))); } catch {}
  });
  ws.on('unexpected-response', (_req, res) => {
    console.log('chat: refused with HTTP', res.statusCode);
  });
  ws.on('error', (err) => console.log('chat: error', err.message));
  ws.on('close', () => {
    clearInterval(heartbeat);
    chat.connected = false;
    console.log(`chat: closed, retrying in ${retryMs / 1000}s`);
    setTimeout(connectChat, retryMs);
    retryMs = Math.min(retryMs * 2, 60 * 1000);
  });
}

// ---------- Titles (YouTube only; it has a public oEmbed endpoint) ----------

const titles = new Map();
const titleLookups = new Set();

function lookupTitles(list) {
  for (const e of list) {
    if (e.platform !== 'youtube' || titles.has(e.key) || titleLookups.has(e.key)) continue;
    titleLookups.add(e.key);
    const url = 'https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=' + e.id);
    fetch(url, { signal: AbortSignal.timeout(5000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.title) titles.set(e.key, String(j.title).slice(0, 200)); })
      .catch(() => {})
      .finally(() => titleLookups.delete(e.key));
  }
}

// ---------- HTTP ----------

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'text/plain; charset=utf-8', 'Method not allowed');
  }
  if (url.pathname === '/api/embeds') {
    const minutes = Math.min(Math.max(Number(url.searchParams.get('minutes')) || 30, 1), 120);
    const list = topEmbeds(minutes, 20);
    lookupTitles(list);
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 200, 'application/json', JSON.stringify({
      minutes,
      chatConnected: chat.connected,
      watchingSince: chat.since || null,
      embeds: list,
    }));
  }
  if (url.pathname === '/healthz') return send(res, 200, 'text/plain', 'ok');
  serveFile(req, res, url.pathname);
});

server.listen(PORT, () => console.log(`listening on ${PORT}`));
if (process.env.NO_CHAT !== '1') connectChat();

module.exports = { recordMessage, topEmbeds, posts };
