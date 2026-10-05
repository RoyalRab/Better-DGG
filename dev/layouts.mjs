// Batch-3 layouts in the browser: the focus layout (portrait and the row
// layout) and landscape fullscreen on phones with the chat overlay.
//   node dev/fake-live.js &  (and the server on 8769, see CLAUDE.md)
//   CHROMIUM=/opt/pw-browsers/chromium node dev/layouts.mjs
const root = (await import('node:child_process')).execSync('npm root -g').toString().trim();
const { chromium } = await import(root + '/playwright/index.mjs');
const BASE = process.env.BASE || 'http://localhost:8769';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};
const rect = (page, sel) =>
  page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  });
async function open(opts, url, prefs = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', bypassCSP: true, ...opts });
  await ctx.addInitScript((prefs) => {
    for (const [k, v] of Object.entries(prefs)) localStorage.setItem('bdgg:' + k, JSON.stringify(v));
  }, prefs);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(
    /^https:\/\/([\w.-]*\.)?(twitch\.tv|youtube\.com|angelthump\.com|rumble\.com|destiny\.gg|kick\.com)\//,
    (r) =>
      r.fulfill({
        status: 200,
        contentType: /\.js(\?|$)/.test(r.request().url()) ? 'text/javascript' : 'text/html',
        body: '',
      }),
  );
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tabs .tab');
  return { ctx, page, errors };
}
const THREE = '/#kick/drt0123,angelthump/yodime,kick/aaa';

// Focus layout, portrait phone: the big one on top, the others in a row below.
{
  const { ctx, page, errors } = await open(
    { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
    THREE,
  );
  await page.waitForFunction(() => window.dggRemix.state.tiles.length === 3, null, { timeout: 8000 });
  await page.click('#menu-btn');
  check(await page.$eval('#focus-btn', (b) => !b.hidden), 'the focus button shows in multi-view');
  await page.click('#focus-btn');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.body.classList.contains('focus')), 'focus layout turns on');
  const big = await rect(page, '#player .tile.has-sound');
  const small = await page.$$eval('#player .tile:not(.has-sound)', (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  check(
    big.w > 400 && big.h > small[0].h * 2,
    `portrait: the sound tile is big (${big.w}x${Math.round(big.h)} vs ${small[0].w}x${Math.round(small[0].h)})`,
  );
  check(
    small.length === 2 && Math.abs(small[0].y - small[1].y) < 2 && small[0].y >= big.bottom - 1,
    'portrait: the small ones sit in a row underneath',
  );
  check(errors.length === 0, 'portrait: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// Focus layout, desktop (remembered): big on the left, the others stacked on the right.
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } }, THREE, { focusLayout: true });
  await page.waitForFunction(() => window.dggRemix.state.tiles.length === 3, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const big = await rect(page, '#player .tile.has-sound');
  const small = await page.$$eval('#player .tile:not(.has-sound)', (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  check(
    big.w > small[0].w * 2 && small[0].x >= big.right - 1,
    `desktop: big on the left (${Math.round(big.w)} vs ${Math.round(small[0].w)})`,
  );
  check(Math.abs(small[0].x - small[1].x) < 2 && small[1].y > small[0].y, 'desktop: the small ones stack on the right');
  await page.click('#menu-btn');
  await page.click('#focus-btn');
  await page.waitForTimeout(300);
  check(!(await page.evaluate(() => document.body.classList.contains('focus'))), 'the button turns it off again');
  check(errors.length === 0, 'desktop: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// Landscape fullscreen on a phone: the stream fills the screen, the tab row
// is off-screen until the handle is tapped, chat is an overlay on the right.
{
  const { ctx, page, errors } = await open(
    { viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true },
    '/#kick/drt0123',
    { landscapeFull: true },
  );
  await page.waitForTimeout(500);
  check(await page.evaluate(() => document.body.classList.contains('landscape-full')), 'landscape mode is on');
  const player = await rect(page, '#player');
  check(
    player.w >= 900 && player.h >= 400,
    `the stream fills the screen (${Math.round(player.w)}x${Math.round(player.h)})`,
  );
  const tabbar = await rect(page, '#tabbar');
  check(tabbar.y >= 412 - 1, `the tab row is off-screen (top ${Math.round(tabbar.y)})`);
  const chat = await rect(page, '#chat');
  check(
    chat.right >= 914 && chat.w < 460 && chat.h >= 400,
    `chat is an overlay on the right (${Math.round(chat.w)} wide)`,
  );
  await page.click('#tabs-handle');
  await page.waitForTimeout(300);
  check((await rect(page, '#tabbar')).bottom <= 412 + 1, 'the handle brings the tab row up');
  await page.waitForTimeout(4500);
  check((await rect(page, '#tabbar')).y >= 412 - 1, 'the tab row goes away on its own');
  await page.click('#overlay-btn');
  await page.waitForTimeout(200);
  check(await page.$eval('#chat', (el) => getComputedStyle(el).display === 'none'), 'the overlay button hides chat');
  await page.click('#overlay-btn');
  await page.waitForTimeout(200);
  check(await page.$eval('#chat', (el) => getComputedStyle(el).display !== 'none'), 'and shows it again');
  // Portrait again: the normal layout.
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(300);
  const p2 = await rect(page, '#player');
  check(p2.h < 400 && (await rect(page, '#tabbar')).y < 915, 'portrait goes back to the normal layout');
  check(errors.length === 0, 'landscape: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
