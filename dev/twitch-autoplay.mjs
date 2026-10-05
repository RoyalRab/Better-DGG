// Twitch autoplay on phones: the player is started muted (what phones
// allow), the sound is turned on once it plays, and if the browser refuses
// the stream keeps playing muted with the Tap for sound chip. Twitch's embed
// script is stubbed, so this runs without reaching Twitch.
//   node dev/fake-live.js &  (and the server on 8769, see CLAUDE.md)
//   CHROMIUM=/opt/pw-browsers/chromium node dev/twitch-autoplay.mjs
const root = (await import('node:child_process')).execSync('npm root -g').toString().trim();
const { chromium } = await import(root + '/playwright/index.mjs');
const BASE = process.env.BASE || 'http://localhost:8769';

// A stand-in for player.twitch.tv/js/embed/v1.js. MODE: 'ok' accepts unmuting,
// 'refuse' pauses when unmuted (what Chrome does without permission),
// 'stuck' never starts playing on its own.
const stub = (mode) => `
window.__tw = { calls: [], opts: null };
class Player {
  constructor(id, opts) {
    window.__tw.opts = opts;
    this.muted = !!opts.muted;
    this.handlers = {};
    const f = document.createElement('iframe');
    f.src = 'https://player.twitch.tv/?channel=' + opts.channel + '&muted=' + opts.muted;
    f.style.cssText = 'width:100%;height:100%;border:0';
    document.getElementById(id).appendChild(f);
    setTimeout(() => {
      this.fire('ready');
      if ('${mode}' !== 'stuck' || this.muted) setTimeout(() => this.fire('playing'), 50);
    }, 50);
  }
  addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }
  fire(ev) { (this.handlers[ev] || []).forEach((fn) => fn()); }
  setMuted(m) {
    window.__tw.calls.push('setMuted:' + m);
    this.muted = m;
    if (!m && '${mode}' === 'refuse') setTimeout(() => this.fire('pause'), 30);
  }
  getMuted() { return this.muted; }
  setVolume(v) { window.__tw.calls.push('setVolume:' + v); }
  play() { window.__tw.calls.push('play'); setTimeout(() => this.fire('playing'), 30); }
  pause() { this.fire('pause'); }
}
Player.READY = 'ready'; Player.PLAYING = 'playing'; Player.PAUSE = 'pause';
window.Twitch = { Player };
`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const fails = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};

async function run({ mode, touch }) {
  const ctx = await browser.newContext({
    viewport: touch ? { width: 412, height: 915 } : { width: 1366, height: 768 },
    isMobile: touch,
    hasTouch: touch,
    serviceWorkers: 'block',
    bypassCSP: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://player.twitch.tv/js/embed/v1.js', (r) =>
    r.fulfill({ status: 200, contentType: 'text/javascript', body: stub(mode) }),
  );
  await page.route(/player\.twitch\.tv\/\?|player\.kick\.com|youtube|angelthump|rumble|destiny\.gg/, (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: 'x' }),
  );
  await page.goto(BASE + '/#twitch/drt0123', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__tw && window.__tw.opts, null, { timeout: 10000 });
  await page.waitForTimeout(mode === 'stuck' ? 5500 : 2500); // the start watchdog fires at 4 s
  const r = await page.evaluate(() => ({
    opts: window.__tw.opts,
    calls: window.__tw.calls,
    allow: document.querySelector('#player iframe')?.getAttribute('allow') || '',
    chip:
      !!document.querySelector('.sound-chip') &&
      getComputedStyle(document.querySelector('.sound-chip')).display !== 'none' &&
      !document.querySelector('.sound-chip').hidden,
  }));
  await ctx.close();
  return { ...r, errors };
}

// Phone, sound allowed, Twitch accepts the unmute: starts muted, then sound on.
let r = await run({ mode: 'ok', touch: true });
check(r.opts.muted === true, 'phone: player constructed muted');
check(/autoplay/.test(r.allow), 'phone: iframe gets allow="autoplay"');
check(r.calls.includes('setMuted:false'), 'phone: sound turned on after playing');
check(!r.chip, 'phone: no Tap for sound chip when the unmute is accepted');
check(r.errors.length === 0, 'phone: no page errors');

// Phone, Chrome refuses the unmute: back to muted, playing, chip shown.
r = await run({ mode: 'refuse', touch: true });
const i = r.calls.indexOf('setMuted:false');
check(
  i >= 0 && r.calls.slice(i + 1).includes('setMuted:true') && r.calls.slice(i + 1).includes('play'),
  'phone refused: re-muted and played again',
);
check(r.chip, 'phone refused: Tap for sound chip shown');

// Desktop, player never starts on its own: watchdog mutes, plays, chip shown.
r = await run({ mode: 'stuck', touch: false });
check(r.opts.muted === false, 'desktop: player asked for sound');
check(r.calls.includes('setMuted:true') && r.calls.includes('play'), 'desktop stuck: watchdog muted and played');
check(r.chip, 'desktop stuck: Tap for sound chip shown');

await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
