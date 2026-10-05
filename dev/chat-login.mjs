// The chat's "log in" link: with the page's CSP enforced, the frame can't
// navigate to destiny.gg's login page; the app opens it in a new tab and
// puts the chat back. Needs the fake feed and server (see CLAUDE.md).
const root = (await import('node:child_process')).execSync('npm root -g').toString().trim();
const { chromium } = await import(root + '/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('https://www.destiny.gg/embed/chat', (r) =>
  r.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<body style="background:#111;color:#fff"><a id="login" href="https://www.destiny.gg/login">log in</a></body>',
  }),
);
await ctx.route(/player\.kick\.com|twitch|youtube|angelthump|rumble|destiny\.gg\/login/, (r) =>
  r.fulfill({ status: 200, contentType: 'text/html', body: 'page' }),
);
await page.goto((process.env.BASE || 'http://localhost:8769') + '/', { waitUntil: 'domcontentloaded' });
const frame = await (await page.waitForSelector('#chat-frame[src]', { timeout: 10000 })).contentFrame();
await frame.waitForSelector('#login');
const popupPromise = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
await frame.click('#login');
const popup = await popupPromise;
if (popup) await popup.waitForLoadState('domcontentloaded').catch(() => {});
await page.waitForTimeout(1500);
const chatSrc = await page.$eval('#chat-frame', (f) => f.getAttribute('src'));
const chatOk = await (await page.$('#chat-frame')).contentFrame().then((f) => f.$('#login').then((el) => !!el));
const results = {
  'login page opened in a new tab': !!popup && /destiny\.gg\/login/.test(popup.url()),
  'chat frame is back on the chat': chatSrc === 'https://www.destiny.gg/embed/chat' && chatOk,
  'no page errors': errors.length === 0,
};
let fail = 0;
for (const [k, v] of Object.entries(results)) {
  console.log(`${v ? 'ok  ' : 'FAIL'} ${k}`);
  if (!v) fail++;
}
if (!popup) console.log('popup url: none');
else console.log('popup url:', popup.url());
await browser.close();
process.exit(fail ? 1 : 0);
