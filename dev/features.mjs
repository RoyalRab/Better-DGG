// Batch-1 features in the browser: keyboard shortcuts, chat on the left,
// favorites order, the sleep timer, the ended-stream notice, the share
// target and the restore shortcut.
//   node dev/fake-live.js &  (and the server on 8769, see CLAUDE.md)
//   CHROMIUM=/opt/pw-browsers/chromium node dev/features.mjs
const root = (await import('node:child_process')).execSync('npm root -g').toString().trim();
const { chromium } = await import(root + '/playwright/index.mjs');
const BASE = process.env.BASE || 'http://localhost:8769';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
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
  // Other sites' players and chat: an empty page (an empty script for Twitch's embed library).
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
  await page.waitForFunction(() => location.hash);
  return { ctx, page, errors };
}

// Phone: the ended-stream notice (the fake feed drops dariusirl 9 s after the
// server connects, so this runs first), then favorites.
{
  const { ctx, page, errors } = await open({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await page.click('#tabs .tab:has-text("dariusirl")');
  await page.waitForSelector('#player .ended', { timeout: 20000 }).catch(() => null);
  const ended = await page.$('#player .ended');
  check(!!ended, 'a stream that left the live list shows the ended notice');
  if (ended) {
    const label = await page.$eval('#player .ended button', (b) => b.textContent);
    check(/^Watch /.test(label), `the notice offers the most-embedded stream (${label})`);
    await page.click('#player .ended button');
    await page.waitForTimeout(400);
    check(!/dariusirl/.test(await page.evaluate(() => location.hash)), 'tapping it switches');
  }
  // Favorites: ★ pins the stream to the front (after Destiny, who isn't in the fake list).
  await page.click('#tabs .tab:has-text("bingsamaa")');
  await page.waitForTimeout(300);
  await page.click('#menu-btn');
  await page.click('#fav-btn');
  await page.waitForTimeout(200);
  const after = await page.$$eval('#tabs .tab', (els) =>
    els.map((e) => e.className.includes('fav') + ':' + e.textContent.trim()),
  );
  check(
    after[0] === 'true:bingsamaa' && !after.slice(1).some((x) => x.startsWith('true')),
    `favorite moves to the front (${after.join(', ')})`,
  );
  check(
    await page.$eval('#fav-btn', (b) => b.getAttribute('aria-pressed') === 'true'),
    'favorite button shows pressed for the current stream',
  );
  check(errors.length === 0, 'phone: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// Desktop: keyboard shortcuts and chat on the left.
{
  const { ctx, page, errors } = await open({ viewport: { width: 1366, height: 768 } });
  const h0 = await page.evaluate(() => location.hash);
  await page.keyboard.press('2');
  await page.waitForTimeout(300);
  const h2 = await page.evaluate(() => location.hash);
  check(h2 !== h0, `key 2 switches to the second tab (${h0} → ${h2})`);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  check((await page.evaluate(() => location.hash)) === h0, 'arrow left goes back');
  await page.keyboard.press('c');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.body.classList.contains('no-chat')), 'C hides chat');
  await page.keyboard.press('c');
  await page.keyboard.press('m');
  check(await page.evaluate(() => window.dggRemix.state.addMode === true), 'M turns add mode on');
  await page.keyboard.press('m');
  // Chat on the left.
  await page.click('#menu-btn');
  await page.click('#settings-btn');
  await page.check('#opt-chat-left');
  const order = await page.evaluate(() => {
    const p = document.querySelector('#player').getBoundingClientRect();
    const c = document.querySelector('#chat').getBoundingClientRect();
    return { chatLeft: document.body.classList.contains('chat-left'), chatBeforePlayer: c.left < p.left };
  });
  check(order.chatLeft && order.chatBeforePlayer, 'chat on the left moves chat before the player');
  await page.uncheck('#opt-chat-left');
  // Get the app: steps for this browser, the others folded, destiny.gg links, chat pop-out on desktop.
  const install = await page.evaluate(() => ({
    steps: document.querySelector('#install-steps').textContent,
    others: document.querySelectorAll('#install-all p').length,
    links: [...document.querySelectorAll('#dgg-links button')].map((b) => b.textContent),
    popout: !document.querySelector('#chat-popout').hidden,
    installBtn: !document.querySelector('#install-btn').hidden,
  }));
  check(
    /^Chrome on a computer: /.test(install.steps),
    `settings give the install steps for this browser (${install.steps.slice(0, 40)}…)`,
  );
  check(install.others >= 10, `and fold the other browsers' steps (${install.others})`);
  check(install.links.includes('Subscribe') && install.links.includes('Donate'), 'destiny.gg links are listed');
  check(install.popout && install.installBtn, 'desktop gets Pop out chat and the Install button');
  // Themes: a preset recolours the app, Custom takes two colours, and the choice is kept.
  await page.click('#theme-row button[data-theme="synthwave"]');
  const theme = await page.evaluate(() => ({
    id: document.documentElement.dataset.theme,
    accent: getComputedStyle(document.body).getPropertyValue('--accent').trim(),
    themeColor: document.querySelector('meta[name=theme-color]').getAttribute('content'),
    saved: localStorage.getItem('bdgg:theme'),
  }));
  check(theme.id === 'synthwave' && theme.accent === '#ff3ea5', `a theme recolours the app (${theme.accent})`);
  check(
    theme.themeColor === '#1d1140' && theme.saved === '"synthwave"',
    'and the browser bar and the saved choice follow',
  );
  await page.click('#theme-row button[data-theme="custom"]');
  await page.$eval('#theme-accent', (i) => {
    i.value = '#ffffff';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const custom = await page.evaluate(() => ({
    hidden: document.querySelector('#theme-custom').hidden,
    onAccent: document.documentElement.style.getPropertyValue('--on-accent'),
  }));
  check(!custom.hidden && custom.onAccent === '#000', 'Custom shows the colour pickers and picks readable button text');
  await page.click('#theme-row button[data-theme="dark"]');
  // Sleep timer: set 15 min, then make it expire.
  await page.click('#sleep-buttons button[data-sleep="15"]');
  const status = await page.$eval('#sleep-status', (e) => e.textContent);
  check(/Pausing in 15 min/.test(status), `sleep timer shows the time left (${status})`);
  await page.evaluate(() => localStorage.setItem('bdgg:sleepUntil', String(Date.now() - 1000)));
  await page.waitForTimeout(16000);
  check(/Sleep timer: paused/.test(await page.$eval('#toast', (t) => t.textContent)), 'sleep timer pauses and says so');
  check(errors.length === 0, 'desktop: no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// Share target and the restore shortcut.
{
  const { ctx, page } = await open(
    { viewport: { width: 412, height: 915 } },
    '/share?url=https%3A%2F%2Fkick.com%2Fbingsamaa',
  );
  check((await page.evaluate(() => location.hash)) === '#kick/bingsamaa', 'a shared Kick link opens that stream');
  check((await page.evaluate(() => location.search)) === '', 'the share address is cleaned up');
  await page.evaluate(() =>
    localStorage.setItem('bdgg:lastMulti', JSON.stringify(['kick/drt0123', 'angelthump/yodime'])),
  );
  await page.goto(BASE + '/?restore=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.dggRemix.state.tiles.length === 2, null, { timeout: 8000 }).catch(() => null);
  check(
    (await page.evaluate(() => window.dggRemix.state.tiles.length)) === 2,
    'the Multi-view shortcut restores the last set',
  );
  await ctx.close();
}

await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
