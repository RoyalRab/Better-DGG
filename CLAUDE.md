# CLAUDE.md

DGG Remix: an unofficial mobile-first web app (installable PWA) for destiny.gg's live embeds plus destiny.gg chat. User-facing docs are in README.md, and ideas for next steps are in IDEAS.md.

## Working with this user
- **Share the link in every reply**, as the last line: https://better-dgg.up.railway.app
- **Update README.md in the same commit as any user-visible change.** Keep the "What's different from destiny.gg" tables current, and put each feature in the right table: "Mobile experience" for phone- and tablet-specific things, "Everywhere" for the rest. Also update "Using it", "Limits" or "Development" when they're affected, and IDEAS.md when an idea ships (remove it).
- Plain prose in chat. Ask instead of guessing when a request is ambiguous.
- The owner tests on an Android phone in Chrome, as the installed app. After a deploy, they pick up changes with the update bar or ⋮ → Refresh.
- The repo is public: never commit personal details (names, emails, devices, accounts) or secrets.

## Deploy
- Railway deploys from `main` on every push (about 40 s). Work on a branch if the session gives you one, and push to `main` (`git push origin HEAD:main`) to ship.
- Railway project `39eb599e-868e-49f2-9d41-3b53a9718181`, service `web` `e3a97c74-8d6c-4415-adca-eb1ba18fafd0`, environment `5dc0d05e-255c-4262-9e85-6e2ff4eb8bb6`, domain better-dgg.up.railway.app (port 8080).
- To confirm a deploy, use Railway MCP `get-logs` on the service (types `deploy`) and look for `listening on 8080` and `live: connected`. Build logs show `icons: built from destiny.gg icon with REMIX tag`.
- Don't bump anything for caching: the server rewrites `CACHE` and `ASSETS` in `sw.js` and the `?v=` on app.css and the JS modules with content hashes at startup.
- Railway's health check is `/healthz` (60 s timeout); a new deploy only takes traffic once it answers. On SIGTERM the server tells SSE clients to retry in 1 s.
- Bump `version` in `package.json` for every user-visible change (semver: patch for fixes, minor for features), update `package-lock.json` with `npm install --package-lock-only`, and add a `CHANGELOG.md` entry (`## x.y.z (YYYY-MM-DD)` plus `- ` lines in plain user language). The menu shows the newest entry, and a unit test fails if the top entry doesn't match `package.json`.
- Before pushing, run `npm run check` (ESLint, Prettier, unit tests). GitHub Actions runs the same on every push. `npm run format` fixes formatting. The menu shows `Version x.y.z (commit)` from `/api/version`, using `RAILWAY_GIT_COMMIT_SHA` for the commit.

## Sandbox limits
- This container can't reach destiny.gg, Kick, Twitch, YouTube or *.railway.app (curl and WebFetch are blocked).
- To fetch from the internet, use a Railway Function named `dgg-probe` (Bun). It may have been deleted; if so, recreate it with `create-function` in the project. Put a one-off script in it with `update-function-source-code`; it runs once on deploy. Read its `console.log` output with `get-logs`.
- Don't use `pkill -f` with a pattern that also appears in the command line: it kills the shell itself. Kill by PID instead: `for p in $(ps aux | grep -E "node (server\.js|dev/fake-live)" | grep -v grep | awk '{print $2}'); do kill $p; done`.

## Code map
- `server.js`: serves `public/` from memory, precompressed with Brotli and gzip, with ETags. `index.html` gets hashed `app.css?v=` and `js/main.js?v=` URLs plus `modulepreload` links (cached a year, immutable); all JS modules share one `?v=` (a hash of all of them), which the server also writes into their `import` lines. hls.js is vendored at `/vendor/hls-<version>.min.js` from the exact-pinned `hls.js` dependency (update with `npm install hls.js@x.y.z --save-exact`). `changelog.json` is built from `CHANGELOG.md`. Everything else is `no-cache`. Exports its pieces for `test/` and only listens when run directly.
  - `/api/embeds` (snapshot) and `/api/live` (SSE) relay `wss://live.destiny.gg`: the `dggApi:embeds` and `dggApi:streamInfo` messages. Only live kick/twitch/youtube/angelthump/rumble embeds are sent, with platform, id, name and title. `broadcast()` skips unchanged lists, so don't add fast-changing fields like viewer counts. At most 10 SSE connections per visitor (429 beyond; the app falls back to polling).
  - `/api/stream/kick/<slug>.m3u8` takes `playback_url` from `kick.com/api/v2/channels/<slug>` (cached 30 s), relays the master playlist with absolute URIs (`rewriteMaster`, cached 5 s), and returns 404 when the channel isn't live. Concurrent requests for the same channel share one Kick lookup (`shared()`). 60 requests a minute per visitor (`makeLimiter`, keyed on Railway's `X-Real-IP`).
  - `CSP`: allows only the sites the app uses. **Adding a platform or host means adding it to `CSP`** (frames in `frame-src`, scripts in `script-src`, video in `media-src`/`connect-src`). Kick's IVS video is `*.live-video.net`. Violations POST to `/api/csp-report` and are logged as `csp: blocked <directive> <host>` (check `get-logs` after changes).
- `public/js/` (ES modules, no build step; `main.js` lists them):
  - `util.js`: `$`, `store` (localStorage `bdgg:*`), `settings`, `toast`, `announce` (screen reader `#sr-status`), device checks, `rowLayoutQuery` (must match the row layout media query in app.css).
  - `sources.js`: no DOM, unit tested. `parseSource`/`validate` for DGG hash links like `#kick/name` and platform URLs; `key(src)` gives `type/id`; `parseHashList`; `liveItems` turns the server's list into tabs.
  - `state.js`: `state.tiles`, `state.current` (the stream with sound), `state.tabItems`, `knownNames`/`streamName`.
  - `stage.js`: keep-warm (`retire` parks a playing own-player tile, muted and hidden as `.parked`, for 60 s; `takeParked` brings it back in `setTiles`; one at a time; `dropParked` when the own-player setting changes), `prepare`/`cancelPrepare` (a tab press starts a hidden `.preparing` tile that the click adopts in `setTiles`; pointercancel, a long-press or 3 s drops it), `mountTile`, `makeTile`, `setTiles` (with the handoff: in single view the old tile gets `.leaving` and stays on top until the new one fires `onPlaying`, or 1.5 s after `onLoaded`, or 10 s), `renderStage`, `watch` (tap switches, `{add:true}` adds), `setAudio`, `layoutTiles`, the `.loading` spinner, autoplay (`soundCheck`/`soundAllowed`), Media Session, keep-playing-on-lock for iframes, wake lock.
  - `players.js`: `mountFrame`/`mountYouTube`/`mountTwitch` and `mountOwn` (Kick via hls.js: `HLS_CONFIG` with a low starting bitrate and `LIVE_CATCH_UP` (up to 1.15× playback toward 3 segments behind, jump when over 6); 12 s start watchdog that falls back to the iframe; a 2 s health check that recovers a frozen stream and renders `.live-chip` as LIVE or "Ns behind · Jump to live"; background audio via `makeAudioOnlyHls`, which drops the video track in `hls.trigger`). Players report through `tile.onLoaded/onPlaying/onPaused/onSoundBlocked/remount`, so they don't import stage.js. `canControlSound` is false for AngelThump and Rumble iframes, so they get no Tap for sound chip (it would reload them).
  - `tabs.js`: platform icons, `renderTabs` (reuses buttons by key; scrolls the row with `scrollLeft`, never `scrollIntoView`, which would move the page), one-time hold hint, `applyLive` (fires a `livelist` event), `startTabs` (EventSource plus polling).
  - `chat.js`: lazy `loadChat` (when the first player starts, or after 4 s), the `#chat-resizer` (drag, arrow keys, double-click reset; width in `bdgg:chatWidth` as `--chat-w`).
  - `pip.js`: standard picture-in-picture for the own player, Document PiP for iframes on desktop.
  - `menu.js`: `setActions` (the ⋮ action row; a tap outside or Escape closes it), `#sheet` (bottom sheet with swipe-down close on phones ≤640 px), toggles, version, inline change log (`renderChangelog`), cast sheet, install bar.
  - `bars.js`: service worker registration and update bar, what's new bar (`bdgg:seenVersion`), offline bar, restore bar (`offerRestore`, `bdgg:lastMulti`).
  - `main.js`: startup. A hash link opens directly; otherwise `start()` waits up to 2 s for the live list. Sets `window.dggRemix = { state, key }` for tests.
  - Import cycles exist (stage ↔ tabs/pip/chat, menu ↔ bars). They're safe because nothing calls an imported function at module top level; keep it that way.
- `public/sw.js`: cache first. Install caches `ASSETS` (filled in by the server) and waits; the app shows "Update ready" and posts `skipWaiting` when tapped. Old numbered caches (`bdgg-vN`) trigger an immediate takeover once, to migrate old installs.
- `public/index.html`: there's no header. `#menu-btn` (⋮, ✕ when open, `aria-expanded`) slides out `#actions`, a toolbar of icon-only buttons (labels in `aria-label`/`title`; pip.js updates `#pip-btn`'s) over the tab row: refresh, PiP, multi-view, cast, reload chat, install, and `#settings-btn` (gear) which opens `#sheet` (toggles, info, change log). The owner chose this over a gear button or a dropdown. Sheets close instantly (an animation felt slow). The server serves Android user agents `/index-android.html`, the same page without `viewport-fit=cover`, because Chrome's installed app drew the page behind the navigation buttons without reporting their height (`Vary: User-Agent`). Notice bars (install, update, what's new, offline, restore), then `#watch` (`#player`, `#tabbar` with `#tabs` and `#menu-btn`), `#chat-resizer`, `#chat` (iframe `destiny.gg/embed/chat`, loaded lazily from `data-src`), dialogs `#sheet` (with `#changelog`) and `#cast-sheet`, `#toast` and `#sr-status`.
- `public/app.css`: portrait stacks the player, tabs and chat. `body` pads all four safe-area insets: the installed app on Android draws behind the navigation buttons. The tab row looks 28 px tall but `#tabs` and `#menu-btn` are 44 px with -8 px margins (bigger tap targets); the selected underline is a `::after`. Reduced motion turns animations off.
- `test/`: `node:test` unit tests for `sources.js` and the server (live list, Kick relay with `fetch` stubbed, limits, CSP, hashed files, service worker assets, change log vs version).
- Icons: `scripts/make-icons.mjs` runs in the Docker build stage, composites `icon-src/remix-tag.png` (a large tag across the bottom, readable on a home screen) onto destiny.gg's current manifest icon (sharp, devDependency), and keeps the committed icons on failure. Bump `?v=` on the icon URLs in the manifest and index.html when they change.

## Decisions already made (don't relitigate)
- **Lock-screen audio is Kick-only.** Chrome on Android pauses `<video>` in hidden pages but allows audio-only playback; Kick has no audio-only rendition, hence the track-dropping hls.js.
- **No own player for Twitch, YouTube or AngelThump.** Twitch media playlists return 403 for non-Twitch origins. YouTube streams are tied to its own player. We don't spoof any of these.
- **AngelThump** (probed Oct 2026): its player POSTs to `vigor.angelthump.com/<ch>/token` with an `Identifier` header from its own code (no CORS for other sites), gets a one-hour per-channel JWT, and only the master `vigor.angelthump.com/hls/<ch>.m3u8?token=` needs it; media playlists (`video-cdn.angelthump.com`) and segments (`sfo1.angelthump.com` etc.) are open with `ACAO: *`. One ~6–8 Mbps Source level, 2 s fMP4 segments with audio and video muxed (so the Kick audio-only trick would need the video track stripped from the MP4 boxes). The owner asked for an AngelThump own player via that token; Claude Code's auto-mode safety check blocked it. Don't retry unless the owner explicitly allows it. Keeping a stream warm after switching away needs a player the app can mute, which AngelThump's iframe isn't.
- **Kick master playlist** is relayed because its CORS headers are inconsistent. Media playlists and segments send `ACAO: *` and are fetched directly. Chrome's native HLS couldn't play them on Android, so the app uses hls.js whenever MSE exists.
- **Icon** is the real destiny.gg logo plus a REMIX tag, at the user's explicit request after being told the risk. The name is "DGG Remix", and the menu keeps the "unofficial fan-made" line.
- **The app can't detect chat login** (cross-origin iframe), so there's no login button.
- **Tabs** look like destiny.gg's (platform icon and name, no viewer counts). Tap switches, long-press or right-click adds to multi-view. The owner chose to keep that over a long-press menu, so favorites are on hold.
- **Change log** is inline at the bottom of the menu (latest version listed, older ones in a `<details>`), at the owner's choice.

## Testing across screens, browsers and devices

Before shipping a layout, player or menu change, test it at every screen size and on every browser and platform the app supports. Automate what this container can do and give the user the manual checklist for the rest, or run it on real devices or a device cloud (BrowserStack, LambdaTest) if one is available.

**Automated, here (Chromium only):** run `node dev/screens.mjs` against the fake feed (setup under Local testing). It loads a 3-stream multi-view at 360×800, 412×915 and 915×412 (Android), 390×844 and 844×390 (iPhone), 820×1180 and 1180×820 (iPad), 1366×768 (laptop), 1920×1080 (desktop) and 3440×1440 (ultrawide), using phone and tablet user agents with touch. It checks that there's no sideways scrolling, the player starts at the top, the tab row and ⋮ are visible, the tiles fit, chat sits below in portrait and to the right in landscape and on desktop, and there are no page errors. Screenshots land in `dev-screens/` (gitignored); look at a few. Then run `node dev/smoke.mjs` for the main flows. The container has no Firefox, WebKit or real devices, so the checks below are manual.

**Manual matrix:** at each size above, on each target, check that the layout matches the screenshots, tabs switch, long-press or right-click adds to multi-view, the menu opens, and Tap for sound and autoplay work. Then check the target's own column:

| Target | How to open it | Also check |
| --- | --- | --- |
| Android, Chrome tab | Open the link in Chrome | Install bar shows; Kick keeps playing with the screen locked; picture-in-picture; lock screen controls |
| Android, installed Chrome app | Install from the bar or ⋮ → Add to home screen, open from the icon | Opens full screen with the REMIX icon; sound starts without a tap; lock-screen audio; auto picture-in-picture on home; Refresh app; Cast this stream (Kick) |
| Android, Firefox | Open the link in Firefox | Layout, playback; install via ⋮ → Install |
| iPhone, Safari | Open the link in Safari | Layout with the notch (portrait and landscape); Tap for sound; picture-in-picture (Kick); iOS install hint in the menu |
| iPhone, home screen app | Share → Add to Home Screen, open from the icon | Status bar area; screen stays on (iOS 18.4+); what happens on lock (iOS may pause; note it in Limits) |
| iPad, Safari and home screen app | As for iPhone | Portrait stacks and landscape puts chat on the right; multi-view grid |
| macOS, Safari | Open the link | Layout, playback through Safari's Media Source; picture-in-picture; File → Add to Dock |
| macOS and Windows, Chrome and Edge | Open the link | Layout at laptop/1080p/ultrawide; mouse wheel on tabs; right-click adds; Document picture-in-picture for Twitch/YouTube; Cast tab steps |
| macOS and Windows, installed Chrome/Edge app | Install icon in the address bar, open the app window | Runs in its own window; resizing re-lays out the multi-view grid |
| macOS and Windows, Firefox | Open the link | Layout and playback; no desktop install (expected); picture-in-picture uses Firefox's own toggle |

Record anything a platform can't do in README → Limits rather than working around it silently.

## Local testing
- `npm install`. Playwright is installed globally (`$(npm root -g)/playwright/index.mjs`); Chromium is at `/opt/pw-browsers/chromium`. Don't run `playwright install`.
- Fake feed and checks: `node dev/fake-live.js &`, then `LIVE_URL=ws://localhost:9996 PORT=8769 node server.js &`, then `node dev/smoke.mjs` and `node dev/screens.mjs`. The fake feed drops `dariusirl` after 9 s (by design), so restart the server (a fresh feed connection) before each smoke run, or the tap check fails.
- The app's internals are reachable in Playwright as `window.dggRemix.state` (e.g. `dggRemix.state.tiles[0].player.video`).
- Headless Chromium has no H.264 or AAC. For own-player playback tests, make a VP9/Opus fMP4 HLS stream: `ffmpeg -f lavfi -i testsrc=size=320x180:rate=25 -f lavfi -i sine=frequency=440 -t 12 -c:v libvpx-vp9 -deadline realtime -b:v 300k -c:a libopus -f hls -hls_segment_type fmp4 -hls_time 2 -hls_playlist_type vod -master_pl_name master.m3u8 media.m3u8`. Add `CODECS="vp09.00.10.08,opus"` to the master, serve it with `npx http-server <dir> --cors`, and route `**/api/stream/kick/*.m3u8` to it in Playwright. hls.js is served by the local server. Pass `serviceWorkers: 'block'` to `newContext` when a test routes requests, since the service worker serves cached files, and `bypassCSP: true` when it plays streams from localhost (the CSP only allows `*.live-video.net`).
- To test the audio-only trick, use an H.264 + MP3 TS stream (`-c:v libx264 -c:a libmp3lame`) with CODECS removed from the master. It only plays if the video track was dropped.
- To simulate a lock in Playwright, override `document.hidden`/`visibilityState`, dispatch `visibilitychange`, and call `video.pause()` (that's what Chrome does).
