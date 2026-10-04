// Screen-size check: loads the app at common phone, tablet, desktop and
// ultrawide sizes (with phone/tablet user agents and touch where it
// matters), checks the layout, tries multi-view, and saves screenshots to
// dev-screens/ for a look. Uses the preinstalled Chromium; real Safari,
// Firefox and devices still need the manual checklist in CLAUDE.md.
//
//   node dev/fake-live.js &
//   LIVE_URL=ws://localhost:9996 PORT=8769 node server.js &
//   node dev/screens.mjs [http://localhost:8769]

import { execSync } from 'node:child_process';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:8769';
const { chromium } = await import(
  process.env.PLAYWRIGHT || `${execSync('npm root -g').toString().trim()}/playwright/index.mjs`
);
// CHROMIUM points at a browser binary; without it Playwright uses its own.
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
fs.mkdirSync('dev-screens', { recursive: true });

const ANDROID =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sizes = [
  { name: 'small-android-portrait', w: 360, h: 800, ua: ANDROID, mobile: true, row: false },
  { name: 'android-portrait', w: 412, h: 915, ua: ANDROID, mobile: true, row: false },
  { name: 'android-landscape', w: 915, h: 412, ua: ANDROID, mobile: true, row: true },
  { name: 'iphone-portrait', w: 390, h: 844, ua: IPHONE, mobile: true, row: false },
  { name: 'iphone-landscape', w: 844, h: 390, ua: IPHONE, mobile: true, row: true },
  { name: 'ipad-portrait', w: 820, h: 1180, ua: IPAD, mobile: true, row: false },
  { name: 'ipad-landscape', w: 1180, h: 820, ua: IPAD, mobile: true, row: true },
  { name: 'laptop', w: 1366, h: 768, row: true },
  { name: 'desktop-1080p', w: 1920, h: 1080, row: true },
  { name: 'ultrawide', w: 3440, h: 1440, row: true },
];

let failed = 0;
for (const s of sizes) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    userAgent: s.ua,
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
  });
  await ctx.addInitScript(() => {
    try {
      if (location.origin.startsWith('http://localhost')) {
        localStorage.setItem('bdgg:ownPlayer', 'false');
        localStorage.setItem('bdgg:installDismissedAt', String(Date.now()));
      }
    } catch {}
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base + '/#kick/drt0123,kick/dariusirl,angelthump/yodime');
  await p.waitForTimeout(1200);
  const m = await p.evaluate(() => {
    const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const player = r('#player');
    const chat = r('#chat');
    const tiles = [...document.querySelectorAll('#player .tile')].map((t) => t.getBoundingClientRect());
    return {
      overflowX: document.documentElement.scrollWidth > innerWidth + 1,
      playerTop: Math.round(player.top),
      chatRight: chat && chat.left >= player.right - 1 && chat.width > 0,
      chatBelow: chat && chat.top >= player.bottom - 1 && chat.height > 0,
      tabsVisible: (r('#tabbar')?.height || 0) > 0,
      menuVisible: (r('#menu-btn')?.width || 0) > 0,
      tiles: tiles.length,
      tilesOnScreen: tiles.every(
        (t) => t.width > 50 && t.height > 30 && t.right <= innerWidth + 1 && t.bottom <= innerHeight + 1,
      ),
    };
  });
  const ok =
    !m.overflowX &&
    m.playerTop === 0 &&
    m.tabsVisible &&
    m.menuVisible &&
    m.tiles === 3 &&
    m.tilesOnScreen &&
    (s.row ? m.chatRight : m.chatBelow) &&
    errors.length === 0;
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${s.name.padEnd(24)} ${s.w}x${s.h}  ${JSON.stringify(m)}${errors.length ? ' errors: ' + errors.join(' | ') : ''}`,
  );
  await p.screenshot({ path: `dev-screens/${s.name}.png` });
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
