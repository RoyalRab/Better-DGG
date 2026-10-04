# CLAUDE.md

DGG Remix: an unofficial mobile-first web app (installable PWA) for destiny.gg's live embeds plus destiny.gg chat. User-facing docs are in README.md, and ideas for next steps are in IDEAS.md.

## Working with this user
- **Share the link in every reply**, as the last line: https://better-dgg.up.railway.app
- **Update README.md in the same commit as any user-visible change.** Keep the "What's different from destiny.gg" tables current, and put each feature in the right table: "Mobile experience" for phone- and tablet-specific things, "Everywhere" for the rest. Also update "Using it", "Limits" or "Development" when they're affected, and IDEAS.md when an idea ships (remove it).
- Plain prose in chat. Ask instead of guessing when a request is ambiguous.
- The owner tests on an Android phone in Chrome, as the installed app. After a deploy, they pick up changes with ⋮ → Refresh app.
- The repo is public: never commit personal details (names, emails, devices, accounts) or secrets.

## Deploy
- Railway deploys from `main` on every push (about 40 s). Work on a branch if the session gives you one, and push to `main` (`git push origin HEAD:main`) to ship.
- Railway project `39eb599e-868e-49f2-9d41-3b53a9718181`, service `web` `e3a97c74-8d6c-4415-adca-eb1ba18fafd0`, environment `5dc0d05e-255c-4262-9e85-6e2ff4eb8bb6`, domain better-dgg.up.railway.app (port 8080).
- To confirm a deploy, use Railway MCP `get-logs` on the service (types `deploy`) and look for `listening on 8080` and `live: connected`. Build logs show `icons: built from destiny.gg icon with REMIX tag`.
- Bump `CACHE` in `public/sw.js` on every client change.
- Bump `version` in `package.json` for every user-visible change (semver: patch for fixes, minor for features), and update `package-lock.json` with `npm install --package-lock-only`. The menu shows `Version x.y.z (commit)` from `/api/version`, using `RAILWAY_GIT_COMMIT_SHA` for the commit.

## Sandbox limits
- This container can't reach destiny.gg, Kick, Twitch, YouTube or *.railway.app (curl and WebFetch are blocked).
- To fetch from the internet, use a Railway Function named `dgg-probe` (Bun). It may have been deleted; if so, recreate it with `create-function` in the project. Put a one-off script in it with `update-function-source-code`; it runs once on deploy. Read its `console.log` output with `get-logs`.
- Don't use `pkill -f` with a pattern that also appears in the command line: it kills the shell itself. Kill by PID instead: `for p in $(ps aux | grep -E "node (server\.js|dev/fake-live)" | grep -v grep | awk '{print $2}'); do kill $p; done`.

## Code map
- `server.js`: serves `public/` from memory with ETags, plus three API routes.
  - `/api/embeds` (snapshot) and `/api/live` (SSE) relay `wss://live.destiny.gg`: the `dggApi:embeds` and `dggApi:streamInfo` messages. Only live kick/twitch/youtube/angelthump/rumble embeds are sent, with platform, id, name and title. `broadcast()` skips unchanged lists, so don't add fast-changing fields like viewer counts.
  - `/api/stream/kick/<slug>.m3u8` takes `playback_url` from `kick.com/api/v2/channels/<slug>` (cached 30 s), relays the master playlist with absolute URIs, and returns 404 when the channel isn't live.
- `public/app.js`, in section order:
  - Settings: `store` (localStorage `bdgg:*`) and `settings`.
  - Source parsing: `parseSource`/`validate` handle DGG hash links like `#kick/name` and platform URLs; `key(src)` gives `type/id`.
  - Players: tiles; `mountTile` → `mountOwn` (Kick via hls.js) / `mountYouTube` / `mountTwitch` / `mountFrame` (iframes). `current` is the stream with sound; `setTiles`, `renderStage`, `watch` (tap switches, `{add:true}` adds) and `setAudio`.
  - `mountOwn`: hls.js player, a 12 s start watchdog that falls back to the iframe, and background audio (`enterBackground`/`startAudioCopy`/`resumeVideo`).
  - `makeAudioOnlyHls`: wraps `hls.trigger` to drop the video track (BUFFER_CODECS, BUFFER_APPENDING, FRAG_PARSED) so Chrome treats the stream as audio-only.
  - Autoplay: `soundCheck`/`soundAllowed` (silent WAV probe); `tile.soundBlocked` shows the "Tap for sound" `.sound-chip`.
  - Picture-in-picture: the standard API for the own player, Document PiP for iframes on desktop.
  - Wake lock; menu (`#sheet`); live tabs (`renderTabs` reuses buttons by key, `applyLive`, `startTabs` with EventSource plus polling fallback); cast (`#cast-sheet`, Remote Playback for the own player); install bar.
  - Start: a hash link opens directly; otherwise `start()` waits up to 2 s for the live list.
- `public/index.html`: there's no header. `#watch` holds `#player` and `#tabbar` (`#tabs` plus `#menu-btn`), then `#chat` (iframe `destiny.gg/embed/chat`), then dialogs `#sheet` and `#cast-sheet`.
- `public/app.css`: portrait stacks the player, tabs and chat. The row layout media query must match `rowLayoutQuery` in app.js.
- Icons: `scripts/make-icons.mjs` runs in the Docker build stage, composites `icon-src/remix-tag.png` onto destiny.gg's current manifest icon (sharp, devDependency), and keeps the committed icons on failure. Bump `?v=` on the icon URLs in the manifest and index.html when they change.

## Decisions already made (don't relitigate)
- **Lock-screen audio is Kick-only.** Chrome on Android pauses `<video>` in hidden pages but allows audio-only playback; Kick has no audio-only rendition, hence the track-dropping hls.js.
- **No own player for Twitch, YouTube or AngelThump.** Twitch media playlists return 403 for non-Twitch origins. YouTube streams are tied to its own player. AngelThump hands out tokens only to its player. We don't spoof any of these.
- **Kick master playlist** is relayed because its CORS headers are inconsistent. Media playlists and segments send `ACAO: *` and are fetched directly. Chrome's native HLS couldn't play them on Android, so the app uses hls.js whenever MSE exists.
- **Icon** is the real destiny.gg logo plus a REMIX tag, at the user's explicit request after being told the risk. The name is "DGG Remix", and the menu keeps the "unofficial fan-made" line.
- **The app can't detect chat login** (cross-origin iframe), so there's no login button.
- **Tabs** look like destiny.gg's (platform icon and name, no viewer counts). Tap switches, long-press or right-click adds to multi-view.

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
- Fake feed and checks: `node dev/fake-live.js &`, then `LIVE_URL=ws://localhost:9996 PORT=8769 node server.js &`, then `node dev/smoke.mjs` and `node dev/screens.mjs`. The fake feed drops `dariusirl` after 9 s (by design), so later runs show it as a dimmed tab.
- Headless Chromium has no H.264 or AAC. For own-player playback tests, make a VP9/Opus fMP4 HLS stream: `ffmpeg -f lavfi -i testsrc=size=320x180:rate=25 -f lavfi -i sine=frequency=440 -t 12 -c:v libvpx-vp9 -deadline realtime -b:v 300k -c:a libopus -f hls -hls_segment_type fmp4 -hls_time 2 -hls_playlist_type vod -master_pl_name master.m3u8 media.m3u8`. Add `CODECS="vp09.00.10.08,opus"` to the master, serve it with `npx http-server <dir> --cors`, and route `**/api/stream/kick/*.m3u8` to it in Playwright. Route `cdn.jsdelivr.net/npm/hls.js@1/...` to a local `npm i hls.js` copy.
- To test the audio-only trick, use an H.264 + MP3 TS stream (`-c:v libx264 -c:a libmp3lame`) with CODECS removed from the master. It only plays if the video track was dropped.
- To simulate a lock in Playwright, override `document.hidden`/`visibilityState`, dispatch `visibilitychange`, and call `video.pause()` (that's what Chrome does).
