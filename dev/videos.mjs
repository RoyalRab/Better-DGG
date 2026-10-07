// Batch-4 features in the browser: stream previews over the tabs, Destiny's
// latest videos in settings while he's offline, and a Kick VOD in the app's
// own player (a local test stream stands in for Kick's).
//   node dev/fake-live.js &  (and the server on 8769, see CLAUDE.md)
//   sh dev/make-stream.sh   (writes dev-out/hls; needs ffmpeg)
//   CHROMIUM=/opt/pw-browsers/chromium node dev/videos.mjs
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
await new Promise((r) => streamServer.listen(8772, r));
const master = fs
  .readFileSync(path.join(DIR, 'master.m3u8'), 'utf8')
  .replace(/^(?!#)(.+)$/gm, 'http://localhost:8772/$1');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};
async function open(opts, url = '/') {
  const ctx = await browser.newContext({ serviceWorkers: 'block', bypassCSP: true, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/stream/kick-vod/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', body: master }),
  );
  await page.route(
    /^https:\/\/([\w.-]*\.)?(twitch\.tv|youtube\.com|angelthump\.com|rumble\.com|destiny\.gg|kick\.com|ytimg\.com|jtvnw\.net)\//,
    (r) =>
      r.fulfill({
        status: 200,
        contentType: /\.js(\?|$)/.test(r.request().url())
          ? 'text/javascript'
          : /\.(jpg|webp|png)/.test(r.request().url())
            ? 'image/png'
            : 'text/html',
        body: '',
      }),
  );
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tabs .tab');
  return { ctx, page, errors };
}

// Desktop: a preview appears when the mouse rests on a tab.
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  await page.hover('#tabs .tab:has-text("drt0123")');
  await page.waitForTimeout(600);
  const shown = await page.$eval('#preview', (el) => !el.hidden && el.querySelector('img').src);
  check(/images\.kick\.com/.test(shown || ''), `hovering a tab shows its preview (${shown})`);
  await page.mouse.move(600, 600);
  // Headless Chromium sends no leave event when the mouse moves onto an
  // iframe, so this relies on the hover poll or the time limit.
  await page
    .waitForFunction(() => document.querySelector('#preview').hidden, null, { timeout: 5000 })
    .catch(() => null);
  check(await page.$eval('#preview', (el) => el.hidden), 'it goes away after the mouse leaves');
  // Destiny is offline in the fake feed: the latest videos show in settings.
  await page.click('#menu-btn');
  await page.click('#settings-btn');
  await page.waitForTimeout(200);
  const items = await page.$$eval('#latest-list .latest-item', (els) => els.map((e) => e.textContent.trim()));
  check(
    !(await page.$eval('#latest', (el) => el.hidden)) && items.length >= 2,
    `latest videos listed (${items.join(' | ')})`,
  );
  await page.click('#latest-list .latest-item:first-child');
  await page.waitForTimeout(500);
  check(
    /^#youtube\//.test(await page.evaluate(() => location.hash)),
    `tapping one opens it (${await page.evaluate(() => location.hash)})`,
  );
  check(errors.length === 0, 'desktop: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// Phone: holding a tab shows the preview, which goes when the hold adds the stream.
{
  const { ctx, page, errors } = await open({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  // The Menu pill covers the end of the tab row, so bring the tab fully into view first.
  const tab = await page.$('#tabs .tab:has-text("bingsamaa")');
  await page.$eval('#tabs .tab:has-text("bingsamaa")', (t) => {
    t.parentElement.scrollLeft = t.offsetLeft - 8;
  });
  await page.waitForTimeout(100);
  const box = await tab.boundingBox();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  await page.waitForTimeout(400);
  check(await page.$eval('#preview', (el) => !el.hidden), 'holding a tab shows the preview');
  await page.waitForTimeout(400);
  check(await page.$eval('#preview', (el) => el.hidden), 'it goes once the hold adds the stream');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  check((await page.evaluate(() => window.dggRemix.state.tiles.length)) === 2, 'the hold added the stream');
  check(errors.length === 0, 'phone: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// A Kick VOD plays in the app's own player, without the live chip.
{
  const { ctx, page, errors } = await open(
    { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    '/#kick-vod/Destiny/489b8b26-8a97-400f-9845-13d8f6fa6d1b',
  );
  const playing = await page
    .waitForFunction(
      () => {
        const v = document.querySelector('#player video.own-player');
        return v && v.currentTime > 0.5 && !v.paused;
      },
      null,
      { timeout: 20000 },
    )
    .then(
      () => true,
      () => false,
    );
  check(playing, 'a Kick VOD plays in the own player');
  check(await page.$eval('#player .live-chip', (el) => el.hidden), 'no live chip on a VOD');
  const tabName = await page.$eval('#tabs .tab[aria-current="true"] .name', (el) => el.textContent);
  check(/Destiny \(VOD\)/.test(tabName), `the tab names the VOD (${tabName})`);
  check(errors.length === 0, 'vod: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

await browser.close();
streamServer.close();
if (fails.length) {
  console.log(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
