# CLAUDE.md

DGG Remix: an unofficial mobile-first web app (installable PWA) for destiny.gg's live embeds plus destiny.gg chat. User-facing docs are in README.md, and ideas for next steps are in IDEAS.md.

## Working with this user
- End every reply with the live link: https://better-dgg.up.railway.app
- Plain prose in chat. Ask instead of guessing when a request is ambiguous.
- They test on an Android phone (Samsung, Chrome, installed app). After a deploy, they pick up changes with ⋮ → Refresh app.

## Deploy
- Branch `ccr-d4ff348c-ajgrc9`. Railway redeploys on every push (about 40 s).
- Railway project `39eb599e-868e-49f2-9d41-3b53a9718181`, service `web` `e3a97c74-8d6c-4415-adca-eb1ba18fafd0`, environment `5dc0d05e-255c-4262-9e85-6e2ff4eb8bb6`, domain better-dgg.up.railway.app (port 8080).
- To confirm a deploy, use Railway MCP `get-logs` on the service (types `deploy`) and look for `listening on 8080` and `live: connected`. Build logs show `icons: built from destiny.gg icon with REMIX tag`.
- Bump `CACHE` in `public/sw.js` on every client change.

## Sandbox limits
- This container can't reach destiny.gg, Kick, Twitch, YouTube or *.railway.app (curl and WebFetch are blocked).
- To fetch from the internet, put a one-off script in the Railway Function `dgg-probe` (service `555c0ad0-c06a-4ae8-8935-326e8cd29979`, Bun) with `update-function-source-code`. It runs once on deploy; read its `console.log` output with `get-logs`.
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

## Local testing
- `npm install`. Playwright is installed globally (`$(npm root -g)/playwright/index.mjs`); Chromium is at `/opt/pw-browsers/chromium`. Don't run `playwright install`.
- Fake feed and smoke test: `node dev/fake-live.js &`, then `LIVE_URL=ws://localhost:9996 PORT=8769 node server.js &`, then `node dev/smoke.mjs`.
- Headless Chromium has no H.264 or AAC. For own-player playback tests, make a VP9/Opus fMP4 HLS stream: `ffmpeg -f lavfi -i testsrc=size=320x180:rate=25 -f lavfi -i sine=frequency=440 -t 12 -c:v libvpx-vp9 -deadline realtime -b:v 300k -c:a libopus -f hls -hls_segment_type fmp4 -hls_time 2 -hls_playlist_type vod -master_pl_name master.m3u8 media.m3u8`. Add `CODECS="vp09.00.10.08,opus"` to the master, serve it with `npx http-server <dir> --cors`, and route `**/api/stream/kick/*.m3u8` to it in Playwright. Route `cdn.jsdelivr.net/npm/hls.js@1/...` to a local `npm i hls.js` copy.
- To test the audio-only trick, use an H.264 + MP3 TS stream (`-c:v libx264 -c:a libmp3lame`) with CODECS removed from the master. It only plays if the video track was dropped.
- To simulate a lock in Playwright, override `document.hidden`/`visibilityState`, dispatch `visibilitychange`, and call `video.pause()` (that's what Chrome does).
