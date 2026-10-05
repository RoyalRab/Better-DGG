// The server: live list filtering, the Kick relay, static files, limits and
// security headers. Runs the real server on a random port with Kick's API
// stubbed out.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

process.env.NO_LIVE = '1';
const require = createRequire(import.meta.url);
process.env.PUSH_FILE = `${process.env.TMPDIR || '/tmp'}/bdgg-test-push-${process.pid}.json`;
const srv = require('../server.js');
const pkg = require('../package.json');

let base;
const kickCalls = [];
const realFetch = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith('https://kick.com/api/v2/channels/')) {
      kickCalls.push(u);
      await new Promise((r) => setTimeout(r, 50));
      const slug = u.split('/').pop();
      const live = slug !== 'offline';
      return new Response(
        JSON.stringify(live ? { livestream: {}, playback_url: `https://ivs.example/${slug}/master.m3u8` } : {}),
      );
    }
    if (u === 'https://kick.com/api/v1/video/489b8b26-8a97-400f-9845-13d8f6fa6d1b') {
      return new Response(
        JSON.stringify({ uuid: '489b8b26-8a97-400f-9845-13d8f6fa6d1b', source: 'https://vod.example/a/master.m3u8' }),
      );
    }
    if (u.startsWith('https://kick.com/api/v1/video/')) return new Response('{}', { status: 404 });
    if (u === 'https://kick.com/Destiny/videos/01a0f035-19d8-7dca-a86e-5d55f51a5672') {
      return new Response(
        '<html><script>self.__next_f.push("{\\"id\\":\\"01a0f035-19d8-7dca-a86e-5d55f51a5672\\",\\"recording_url\\":\\"https://stream.kick.com/x/y/master.m3u8\\"}")</script></html>',
      );
    }
    if (u.startsWith('https://kick.com/') && u.includes('/videos/')) return new Response('nope', { status: 404 });
    if (u.startsWith('https://stream.kick.com/'))
      return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n720p/index.m3u8\n');
    if (u === 'https://kick.com/api/v2/clips/clip_01JHV4PM1Q1FW2BCGKR258FW37') {
      return new Response(
        JSON.stringify({
          clip: { video_url: 'https://clips.kick.com/clips/87/clip_01JHV4PM1Q1FW2BCGKR258FW37/playlist.m3u8' },
        }),
      );
    }
    if (u.startsWith('https://kick.com/api/v2/clips/')) return new Response('{}', { status: 404 });
    if (u.startsWith('https://vod.example/') || u.startsWith('https://clips.kick.com/')) {
      return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n720p/index.m3u8\n');
    }
    if (u.startsWith('https://ivs.example/')) {
      kickCalls.push(u);
      if (u.includes('/restarting/')) return new Response('[{"error":"Can not find channel"}]', { status: 404 });
      return new Response(
        '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1\n720p.m3u8\n',
      );
    }
    return realFetch(url, opts);
  };
  await new Promise((r) => srv.server.listen(0, r));
  base = `http://127.0.0.1:${srv.server.address().port}`;
});
after(() => {
  globalThis.fetch = realFetch;
  srv.server.closeAllConnections();
  srv.server.close();
});

const get = (path, ip = '10.0.0.1', opts = {}) =>
  realFetch(base + path, { ...opts, headers: { 'X-Real-IP': ip, ...(opts.headers || {}) } });

test('live list keeps only live channels on supported platforms, with few fields', () => {
  srv.live.embeds = [
    { platform: 'kick', id: 'a', mediaItem: { metadata: { displayName: 'A', title: 'x', live: true, viewers: 5 } } },
    { platform: 'youtube', id: 'dQw4w9WgXcQ', mediaItem: { metadata: { live: false } } },
    { platform: 'facebook', id: 'f', mediaItem: { metadata: { live: true } } },
    { mediaItem: { identifier: { platform: 'twitch', mediaId: 'b' }, metadata: { live: true } } },
  ];
  assert.deepEqual(srv.embedList(), [
    { platform: 'kick', id: 'a', name: 'A', title: 'x', preview: null },
    { platform: 'twitch', id: 'b', name: null, title: null, preview: null },
  ]);
  srv.live.streamInfo = {
    streams: { kick: { live: true, id: 'destiny', status_text: 'hi' }, youtube: { live: false } },
  };
  assert.deepEqual(srv.destinyStreams(), [{ platform: 'kick', id: 'destiny', title: 'hi' }]);
});

test('master playlists get absolute URIs', () => {
  const out = srv.rewriteMaster('#EXTM3U\n#X:URI="a/b.m3u8"\nlow.m3u8\n', 'https://h.example/x/master.m3u8');
  assert.equal(out, '#EXTM3U\n#X:URI="https://h.example/x/a/b.m3u8"\nhttps://h.example/x/low.m3u8\n');
});

test('change log parses and matches the package version', () => {
  const parsed = srv.parseChangelog('# C\n\n## 2.0.0 (2026-01-02)\n\n- **New** thing\n  more\n- `x`\n\n## 1.0.0\n');
  assert.deepEqual(parsed, [{ version: '2.0.0', date: '2026-01-02', items: ['New thing more', 'x'] }]);
  const real = srv.parseChangelog(fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));
  assert.equal(real[0].version, pkg.version, 'add a CHANGELOG.md entry for the new version');
});

test('Kick relay shares one lookup between viewers asking at once', async () => {
  kickCalls.length = 0;
  const res = await Promise.all(
    Array.from({ length: 5 }, (_, i) => get('/api/stream/kick/Someone.m3u8', `10.1.0.${i}`)),
  );
  assert.deepEqual(
    res.map((r) => r.status),
    [200, 200, 200, 200, 200],
  );
  const body = await res[0].text();
  assert.match(body, /https:\/\/ivs\.example\/someone\/720p\.m3u8/);
  assert.match(body, /URI="https:\/\/ivs\.example\/someone\/audio\.m3u8"/);
  assert.equal(kickCalls.filter((u) => u.includes('kick.com')).length, 1);
  assert.equal(kickCalls.filter((u) => u.includes('ivs.example')).length, 1);
  assert.equal((await get('/api/stream/kick/offline.m3u8', '10.1.1.1')).status, 404);
  const restarting = await get('/api/stream/kick/restarting.m3u8', '10.1.1.1');
  assert.equal(restarting.status, 503, 'listed live on Kick but no video yet: try again soon');
  assert.equal(restarting.headers.get('retry-after'), '6');
  assert.equal((await get('/api/stream/kick/bad%20name.m3u8', '10.1.1.1')).status, 400);
});

test('Kick VODs and clips are looked up and their playlists relayed', async () => {
  const vod = await get('/api/stream/kick-vod/Destiny/489b8b26-8a97-400f-9845-13d8f6fa6d1b.m3u8', '10.1.2.1');
  assert.equal(vod.status, 200);
  assert.match(await vod.text(), /https:\/\/vod\.example\/a\/720p\/index\.m3u8/);
  assert.equal(
    (await get('/api/stream/kick-vod/Destiny/00000000-0000-0000-0000-000000000000.m3u8', '10.1.2.1')).status,
    404,
  );
  // The id from a VOD page's address: found in the page's own data.
  const fromPage = await get('/api/stream/kick-vod/Destiny/01a0f035-19d8-7dca-a86e-5d55f51a5672.m3u8', '10.1.2.1');
  assert.equal(fromPage.status, 200);
  assert.match(await fromPage.text(), /https:\/\/stream\.kick\.com\/x\/y\/720p\/index\.m3u8/);
  assert.equal((await get('/api/stream/kick-vod/Destiny/not-a-uuid.m3u8', '10.1.2.1')).status, 400);
  const clip = await get('/api/stream/kick-clip/clip_01JHV4PM1Q1FW2BCGKR258FW37.m3u8', '10.1.2.1');
  assert.equal(clip.status, 200);
  assert.match(
    await clip.text(),
    /https:\/\/clips\.kick\.com\/clips\/87\/clip_01JHV4PM1Q1FW2BCGKR258FW37\/720p\/index\.m3u8/,
  );
  assert.equal((await get('/api/stream/kick-clip/clip_NOPE00000000.m3u8', '10.1.2.1')).status, 404);
  assert.equal((await get('/api/stream/kick-clip/junk.m3u8', '10.1.2.1')).status, 400);
});

test("Destiny's latest videos come from the feed, with few fields", () => {
  srv.live.videos = [
    { id: 'aNVnLSyUgkE', title: 'T', mediumThumbnailUrl: 'https://i.ytimg.com/vi/aNVnLSyUgkE/mqdefault.jpg', extra: 1 },
  ];
  srv.live.kickVods = [
    {
      id: 'x',
      platform: 'kick',
      title: 'V',
      mediumThumbnailUrl: 'https://images.kick.com/a.webp',
      url: 'https://kick.com/Destiny/videos/01a0',
      embedUrl: '/bigscreen#kick-vod/Destiny/489b8b26-8a97-400f-9845-13d8f6fa6d1b',
    },
    { id: 'y', platform: 'kick', embedUrl: '/bigscreen#nope' },
  ];
  assert.deepEqual(srv.snapshot().videos, [
    { platform: 'youtube', id: 'aNVnLSyUgkE', title: 'T', thumb: 'https://i.ytimg.com/vi/aNVnLSyUgkE/mqdefault.jpg' },
    {
      platform: 'kick-vod',
      id: 'Destiny/489b8b26-8a97-400f-9845-13d8f6fa6d1b',
      title: 'V',
      thumb: 'https://images.kick.com/a.webp',
      url: 'https://kick.com/Destiny/videos/01a0',
    },
  ]);
  srv.live.videos = null;
  srv.live.kickVods = null;
});

test('Kick relay is rate limited per visitor', async () => {
  const statuses = [];
  for (let i = 0; i < 121; i++) statuses.push((await get('/api/stream/kick/someone.m3u8', '10.2.0.1')).status);
  assert.equal(statuses.filter((s) => s === 200).length, 120);
  assert.equal(statuses[120], 429);
  assert.equal((await get('/api/stream/kick/someone.m3u8', '10.2.0.2')).status, 200, 'other visitors are unaffected');
});

test('live connections are capped per visitor', async () => {
  const aborts = [];
  try {
    for (let i = 0; i < 10; i++) {
      const ac = new AbortController();
      aborts.push(ac);
      const r = await get('/api/live', '10.3.0.1', { signal: ac.signal });
      assert.equal(r.status, 200);
    }
    assert.equal((await get('/api/live', '10.3.0.1')).status, 429);
    const other = new AbortController();
    aborts.push(other);
    assert.equal((await get('/api/live', '10.3.0.2', { signal: other.signal })).status, 200);
  } finally {
    for (const ac of aborts) ac.abort();
  }
});

test('page uses content-hashed files, and the service worker can cache all of them', async () => {
  const html = await (await get('/')).text();
  const js = html.match(/src="(js\/main\.js\?v=[\w-]+)"/)[1];
  assert.match(html, /href="app\.css\?v=[\w-]+"/);
  assert.match(html, /rel="modulepreload" href="js\/stage\.js\?v=/);
  const r = await get('/' + js);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.match(await r.text(), /from '\.\/sources\.js\?v=[\w-]+'/);
  assert.equal((await get('/js/main.js?v=wrong')).headers.get('cache-control'), 'no-cache');
  for (const a of srv.ASSETS) {
    assert.equal((await get('/' + a.replace(/^\.\//, ''))).status, 200, a);
  }
  const sw = await (await get('/sw.js')).text();
  assert.match(sw, /const CACHE = 'bdgg-[\w-]+';/);
  assert.ok(sw.includes(JSON.stringify(srv.ASSETS)));
});

test('malformed requests get a 400 and the server stays up', async () => {
  assert.equal((await get('//')).status, 400);
  assert.equal((await get('/api/stream/kick/%E0%A4%A.m3u8')).status, 400);
  assert.equal(await (await get('/healthz')).text(), 'ok');
});

test('responses are compressed and carry security headers', async () => {
  const r = await get('/', '10.4.0.1', { headers: { 'Accept-Encoding': 'br' } });
  assert.equal(r.headers.get('content-encoding'), 'br');
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /https:\/\/\*\.live-video\.net/);
  // Only the chat embed may be framed from destiny.gg (its login page can't be).
  assert.match(csp, /frame-src https:\/\/www\.destiny\.gg\/embed\/ /);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const report = await get('/api/csp-report', '10.4.0.1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/csp-report' },
    body: JSON.stringify({
      'csp-report': { 'blocked-uri': 'https://evil.example/x.js', 'effective-directive': 'script-src' },
    }),
  });
  assert.equal(report.status, 204);
  assert.equal((await get('/api/embeds', '10.4.0.1', { method: 'POST' })).status, 405);
  assert.equal(await (await get('/healthz')).text(), 'ok');
});

test('banned embeds stay off the list, and a hosted stream is sent', () => {
  const item = (platform, id) => ({
    platform,
    id,
    mediaItem: { identifier: { platform, mediaId: id }, metadata: { displayName: id, title: 't', live: true } },
  });
  srv.live.embeds = [item('kick', 'Good'), item('twitch', 'BadOne')];
  srv.live.banned = new Set(['twitch/badone']);
  assert.deepEqual(
    srv.embedList().map((e) => `${e.platform}/${e.id}`),
    ['kick/Good'],
  );
  srv.live.hosting = { platform: 'kick', id: 'friend', displayName: 'Friend' };
  assert.deepEqual(srv.snapshot().hosting, { platform: 'kick', id: 'friend', name: 'Friend' });
  srv.live.hosting = null;
  assert.equal(srv.snapshot().hosting, null);
  srv.live.banned = new Set();
});

test('error reports are logged with the browser family, within a limit', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    const r = await fetch(base + '/api/report', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) Chrome/154.0 Mobile Safari/537.36',
        'x-real-ip': '10.9.0.1',
      },
      body: JSON.stringify({ kind: 'own-player-failed', detail: 'someone\nline2', version: '1.2.0' }),
    });
    assert.equal(r.status, 204);
    await new Promise((res) => setTimeout(res, 50));
    assert.ok(
      logs.some((l) => l.startsWith('report: own-player-failed v1.2.0 Android/Chrome someone line2')),
      logs.join(' | '),
    );
  } finally {
    console.log = orig;
  }
});

test('the share target path serves the app', async () => {
  const r = await fetch(base + '/share?url=https%3A%2F%2Fkick.com%2Fdestiny');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
});

test('push: keys from the environment, subscriptions kept, notified when Destiny goes live', async () => {
  delete process.env.VAPID_PUBLIC;
  delete process.env.VAPID_PRIVATE;
  assert.equal((await get('/api/push/key', '10.4.0.1')).status, 404, 'off without keys');
  process.env.VAPID_PUBLIC = 'BPUBLIC';
  process.env.VAPID_PRIVATE = 'private';
  const key = await (await get('/api/push/key', '10.4.0.1')).json();
  assert.deepEqual(key, { key: 'BPUBLIC' });
  const post = (p, body, ip) =>
    fetch(base + p, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': ip },
      body: JSON.stringify(body),
    });
  const sub = (endpoint) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
  assert.equal(
    (await post('/api/push/subscribe', { subscription: sub('https://push.example/one') }, '10.4.0.1')).status,
    204,
  );
  assert.equal(
    (await post('/api/push/subscribe', { subscription: sub('https://push.example/gone') }, '10.4.0.2')).status,
    204,
  );
  assert.equal((await post('/api/push/subscribe', { subscription: { endpoint: 'ftp://x' } }, '10.4.0.1')).status, 400);
  assert.equal(srv.push.subs.size, 2);
  const sent = [];
  srv.push.sender = async (s) => {
    sent.push(s.endpoint);
    if (s.endpoint.endsWith('/gone')) {
      const e = new Error('gone');
      e.statusCode = 410;
      throw e;
    }
  };
  srv.live.streamInfo = { streams: { kick: { live: true, id: 'destiny', status_text: 'already on' } } };
  await srv.pushOnStreamInfo();
  assert.deepEqual(sent, [], 'the first streamInfo is a baseline, not news');
  srv.live.streamInfo = {
    streams: { kick: { live: false }, youtube: { live: true, id: 'abc123', status_text: 'hi' } },
  };
  await srv.pushOnStreamInfo();
  assert.deepEqual(sent.sort(), ['https://push.example/gone', 'https://push.example/one']);
  assert.equal(srv.push.subs.size, 1, 'a gone subscription is dropped');
  sent.length = 0;
  srv.live.streamInfo = { streams: { kick: { live: false }, youtube: { live: false } } };
  await srv.pushOnStreamInfo();
  srv.live.streamInfo = { streams: { youtube: { live: true, id: 'abc123' } } };
  await srv.pushOnStreamInfo();
  assert.deepEqual(sent, [], 'not again within ten minutes');
  assert.equal((await post('/api/push/unsubscribe', { endpoint: 'https://push.example/one' }, '10.4.0.1')).status, 204);
  assert.equal(srv.push.subs.size, 0);
  srv.push.sender = null;
  delete process.env.VAPID_PUBLIC;
  delete process.env.VAPID_PRIVATE;
});
