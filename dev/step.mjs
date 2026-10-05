// Next/previous: lock-screen buttons (Media Session nexttrack/previoustrack)
// and a touch swipe across the player step through the live embeds.
//   node dev/fake-live.js &  (and the server on 8769, see CLAUDE.md)
//   CHROMIUM=/opt/pw-browsers/chromium node dev/step.mjs
const root = (await import('node:child_process')).execSync('npm root -g').toString().trim();
const { chromium } = await import(root + '/playwright/index.mjs');
const BASE = process.env.BASE || 'http://localhost:8769';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
  bypassCSP: true,
});
// Capture the Media Session handlers the app registers.
await ctx.addInitScript(() => {
  window.__ms = {};
  if (navigator.mediaSession) {
    navigator.mediaSession.setActionHandler = (name, fn) => {
      window.__ms[name] = fn;
    };
  }
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/twitch|youtube|angelthump|rumble|destiny\.gg|kick\.com/, (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: 'x' }),
);
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#tabs .tab');
await page.waitForFunction(() => location.hash);
const tabs = await page.$$eval('#tabs .tab', (els) => els.map((e) => e.textContent.trim()));
const current = () => page.evaluate(() => location.hash);
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};
const h0 = await current();
await page.evaluate(() => window.__ms.nexttrack && window.__ms.nexttrack());
await page.waitForTimeout(400);
const h1 = await current();
check(h1 !== h0, `nexttrack switches to the next embed (${h0} → ${h1}; tabs: ${tabs.join(', ')})`);
await page.evaluate(() => window.__ms.previoustrack && window.__ms.previoustrack());
await page.waitForTimeout(400);
check((await current()) === h0, 'previoustrack goes back');

// A swipe to the left across the player.
async function swipe(dx) {
  await page.evaluate((dx) => {
    const el = document.querySelector('#player');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const opts = (cx) => ({
      bubbles: true,
      clientX: cx,
      clientY: y,
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 1,
    });
    el.dispatchEvent(new PointerEvent('pointerdown', opts(x)));
    el.dispatchEvent(new PointerEvent('pointerup', opts(x + dx)));
  }, dx);
  await page.waitForTimeout(400);
}
await swipe(-120);
const h2 = await current();
check(h2 !== h0, `swipe left switches to the next embed (${h0} → ${h2})`);
await swipe(120);
check((await current()) === h0, 'swipe right goes back');
await swipe(-20);
check((await current()) === h0, 'a short drag does nothing');
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
