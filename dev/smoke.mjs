// Browser smoke test for the app's main flows, run against a local server
// fed by dev/fake-live.js. Uses the globally installed Playwright and the
// preinstalled Chromium (no download).
//
//   node dev/fake-live.js &                     # fake destiny.gg feed
//   LIVE_URL=ws://localhost:9996 PORT=8769 node server.js &
//   node dev/smoke.mjs [http://localhost:8769]
//
// Exits non-zero if a check fails. Players can't reach Kick/Twitch from a
// sandbox, so this checks the app's own behavior, not real playback.

import { execSync } from 'node:child_process';

const base = process.argv[2] || 'http://localhost:8769';
const pwPath = process.env.PLAYWRIGHT || `${execSync('npm root -g').toString().trim()}/playwright/index.mjs`;
const { chromium } = await import(pwPath);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--autoplay-policy=document-user-activation-required'],
});

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};

const ctx = await browser.newContext({ viewport: { width: 412, height: 870 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  try {
    if (location.origin.startsWith('http://localhost')) {
      localStorage.setItem('bdgg:ownPlayer', 'false'); // use the embed player; no Kick access here
      localStorage.setItem('bdgg:installDismissedAt', String(Date.now()));
    }
  } catch {}
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(base + '/');
await page.waitForTimeout(2500);
const tabs = await page.$$eval('#tabs .tab', (bs) => bs.map((b) => b.innerText.trim()));
check(
  'tabs show the live list (not-live video filtered out)',
  tabs.length >= 4 && !tabs.includes('a video'),
  tabs.join(', '),
);
check('opens on a live stream', /^#kick\/drt0123$/.test(await page.evaluate(() => location.hash)));
check('Tap for sound shown when sound is blocked', await page.isVisible('.sound-chip'));

await page.click('.sound-chip');
await page.waitForTimeout(300);
check('Tap for sound unmutes', /muted=false/.test(await page.getAttribute('#player iframe', 'src')));

await page.click('#tabs .tab:nth-child(2)');
await page.waitForTimeout(300);
check('tap switches stream', (await page.evaluate(() => location.hash)) === '#kick/dariusirl');

const third = page.locator('#tabs .tab:nth-child(3)');
await third.scrollIntoViewIfNeeded();
const box = await third.boundingBox();
await page.mouse.move(box.x + 10, box.y + 10);
await page.mouse.down();
await page.waitForTimeout(700);
await page.mouse.up();
await page.waitForTimeout(300);
check('long-press adds to multi-view', (await page.locator('#player .tile').count()) === 2);

await page.click('#menu-btn');
await page.waitForTimeout(200);
check('⋮ slides out the action icons', await page.isVisible('#actions #settings-btn'));
await page.click('#settings-btn');
await page.waitForTimeout(200);
check(
  'settings open, icons put away',
  await page.evaluate(() => document.querySelector('#sheet').open && document.querySelector('#actions').hidden),
);
await page.click('#opt-chat');
check('Show chat toggles chat', await page.evaluate(() => document.body.classList.contains('no-chat')));
await page.click('#opt-chat');
await page.keyboard.press('Escape');

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
