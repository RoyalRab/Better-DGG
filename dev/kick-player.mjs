// Kick in the app's own player: audio-only mode and the quality cap, with a
// local test stream routed in place of the Kick relay.
//   node dev/fake-live.js &  (and the server on 8769, see CLAUDE.md)
//   sh dev/make-stream.sh   (writes dev-out/hls; needs ffmpeg)
//   CHROMIUM=/opt/pw-browsers/chromium node dev/kick-player.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const root = (await import('node:child_process')).execSync('npm root -g').toString().trim();
const { chromium } = await import(root + '/playwright/index.mjs');
const BASE = process.env.BASE || 'http://localhost:8769';
const DIR = process.env.STREAM_DIR || 'dev-out/hls';
if (!fs.existsSync(path.join(DIR, 'master.m3u8'))) {
  console.log('no test stream in ' + DIR + '; run sh dev/make-stream.sh');
  process.exit(1);
}
const streamServer = http.createServer((req, res) => {
  const f = path.join(DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { 'access-control-allow-origin': '*' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => streamServer.listen(8771, r));
const master = fs
  .readFileSync(path.join(DIR, 'master.m3u8'), 'utf8')
  .replace(/^(?!#)(.+)$/gm, 'http://localhost:8771/$1');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};
async function open(prefs) {
  const ctx = await browser.newContext({
    serviceWorkers: 'block',
    bypassCSP: true,
    viewport: { width: 412, height: 915 },
  });
  await ctx.addInitScript((prefs) => {
    for (const [k, v] of Object.entries(prefs)) localStorage.setItem('bdgg:' + k, JSON.stringify(v));
  }, prefs);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/stream/kick/*.m3u8', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/vnd.apple.mpegurl',
      body: master,
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.route(
    /^https:\/\/([\w.-]*\.)?(twitch\.tv|youtube\.com|angelthump\.com|rumble\.com|destiny\.gg|kick\.com)\//,
    (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '' }),
  );
  await page.goto(BASE + '/#kick/drt0123', { waitUntil: 'domcontentloaded' });
  return { ctx, page, errors };
}

// Audio only: an <audio> element plays, with the card over the tile.
{
  const { ctx, page, errors } = await open({ audioOnly: true });
  const playing = await page
    .waitForFunction(
      () => {
        const a = document.querySelector('#player audio.own-player');
        return a && a.currentTime > 0.5 && !a.paused;
      },
      null,
      { timeout: 20000 },
    )
    .then(
      () => true,
      () => false,
    );
  check(playing, 'audio-only mode plays through an <audio> element');
  check(!!(await page.$('#player .audio-only')), 'the audio-only card is shown');
  check(!(await page.$('#player video')), 'no <video> element in audio-only mode');
  await page.screenshot({ path: path.join(DIR, '..', 'audio-only.png') });
  check(errors.length === 0, 'audio only: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// Quality cap: the test stream has one 180p level; "Up to 360p" caps at it (index 0),
// Auto removes the cap, and the data saver caps on mobile data.
{
  const { ctx, page, errors } = await open({ kickQuality: 360 });
  await page.waitForFunction(
    () => {
      const v = document.querySelector('#player video');
      return v && v.currentTime > 0.5;
    },
    null,
    { timeout: 20000 },
  );
  await page.waitForTimeout(500);
  const levels = await page.evaluate(() => window.dggRemix.state.tiles[0].player.levelsForTests());
  check(Array.isArray(levels) && levels.length === 1, `one level in the test stream (${JSON.stringify(levels)})`);
  check(
    (await page.evaluate(() => window.dggRemix.state.tiles[0].player.cappingForTests())) === 0,
    'Up to 360p caps at the only level',
  );
  await page.evaluate(() => {
    localStorage.setItem('bdgg:kickQuality', '"auto"');
  });
  await page.click('#menu-btn');
  await page.click('#settings-btn');
  await page.selectOption('#opt-quality', 'auto');
  check(
    (await page.evaluate(() => window.dggRemix.state.tiles[0].player.cappingForTests())) === -1,
    'Auto removes the cap',
  );
  // Pretend to be on mobile data: the data saver caps again.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'connection', {
      value: { type: 'cellular', addEventListener() {}, removeEventListener() {} },
      configurable: true,
    });
  });
  await page.check('#opt-datasaver');
  await page.uncheck('#opt-datasaver');
  await page.check('#opt-datasaver');
  check(
    (await page.evaluate(() => window.dggRemix.state.tiles[0].player.cappingForTests())) === 0,
    'data saver caps on mobile data',
  );
  check(errors.length === 0, 'quality: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

await browser.close();
streamServer.close();
if (fails.length) {
  console.log(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
