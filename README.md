# DGG Remix

An unofficial, fan-made web app for watching destiny.gg's live embeds with chat, built for an improved mobile experience. It also works on tablets, desktop browsers and ultrawide screens, and it installs to the home screen like an app. It isn't affiliated with destiny.gg.

Live at https://dggremix.up.railway.app

## What's different from destiny.gg

Chat is destiny.gg's own chat, and the list of live embeds comes from the same feed destiny.gg's bigscreen uses, so those behave the same. Everything below is what DGG Remix adds or changes.

### Mobile experience (phones and tablets)

| Feature | What it does |
| --- | --- |
| Keeps playing when the screen locks | Kick streams keep their sound when you lock the phone or switch apps. Chrome on Android pauses video in the background, so the app switches to an audio-only copy of the stream and back to the video when you return. |
| Lock screen controls | Play and pause from the lock screen and notification, with the stream's name. |
| Screen stays on | The phone doesn't dim or sleep while the app is open (can be turned off in the menu). |
| Installable app | Installs to the home screen with its own icon, opens full screen without the browser bar, and shows an install bar until it's installed. |
| Picture-in-picture | Pops the stream into a floating window from the menu, and Kick streams pop out on their own when you leave the app where the browser supports it. |
| Autoplay with sound | Streams start by themselves. In the installed app they usually start with sound; otherwise there's one **Tap for sound** button. |
| More room for the stream | No top bar. The player starts at the top of the screen, with a short tab row under it and the ⋮ button at the end of the row. |
| One-tap switching | Every live embed is a tab under the player. Tap to switch, press and hold to add it to multi-view (a one-time tip says so). A stream starts loading the moment your finger touches its tab. |
| Phone layouts | Portrait stacks player, tabs and chat. Landscape puts chat on the right. Chat can be hidden to give the stream the whole screen. |
| Cast to TV help | Device-specific steps for screen casting (Smart View, Screen cast, AirPlay), plus direct Chromecast casting for Kick streams. |
| Refresh button | Reloads the installed app, which has no pull-to-refresh. |
| Compact menu | ⋮ slides a row of icon buttons over the tab row; settings open as a bottom sheet on phones that closes with a swipe down. |
| Bigger tap targets | The tab row stays short, but each tab and the ⋮ button take taps across a 44 px area. |
| Opens instantly | The app opens from the phone's cache, even on bad signal, and downloads new versions in the background. An **Update ready** bar appears when one is ready. |
| Offline banner | Shows when the connection drops; the tabs and stream come back on their own when it returns. |
| Faster start on cellular | Kick starts at a lower quality and sharpens as the connection allows, and chat loads after the stream has started. |

### Everywhere

| Feature | What it does |
| --- | --- |
| Real-time embed tabs | The tab row updates the moment someone embeds something, with live streams only (no VODs, clips or ordinary videos), each with its platform icon. |
| Opens on something live | Opens the last stream you watched if it's still live, then Destiny if he's live, then the first tab. A stream on screen that ends keeps a dimmed tab. |
| Multi-view | Up to four streams at once, with a speaker button on each to move the sound and an ✕ to remove it. The grid is sized to give each stream the most room, including on ultrawides. The address bar link reopens the same set. |
| Kick in the app's own player | Kick streams play in the app's own player ([hls.js](https://github.com/video-dev/hls.js)), which is what makes lock-screen audio, picture-in-picture and Chromecast possible. It falls back to Kick's player if it can't start. |
| Desktop extras | Mouse wheel scrolls the tab row, right-click a tab to add it to multi-view, and picture-in-picture works for any stream in Chrome and Edge. |
| Smooth switching | The stream you're leaving stays on screen until the new one starts, with a loading spinner instead of a black box. At startup the player, tabs and chat show placeholders until they're ready. A Kick stream you switch away from keeps running hidden and muted for a minute, so switching back is instant (this uses some data). |
| Stays live | Kick streams in the app's own player catch back up after buffering (slightly faster playback, or a jump if far behind), and show LIVE, or how many seconds behind they are with a **Jump to live** button. |
| Resizable chat | In landscape and on desktop, drag the line between the stream and chat (or use the arrow keys on it) to change chat's width. Double-click resets it. |
| What's new | The menu lists what changed in each version, and a bar mentions it once after an update. |
| Accessible | Visible keyboard focus, a label on every button, stream changes announced to screen readers, and less motion when the system asks for it. |
| Recovers from errors | A **Try again** button when a player fails to load. A frozen Kick stream reloads itself, and a **Jump to live** button appears when it falls behind. |
| Remembers multi-view | Offers to restore your last multi-view set when you open the app. |
| Smooth deploys | New versions only take over once they're running, and open apps reconnect to the live tabs within a second. |

## Using it

Tap a tab to watch it. To watch more than one stream, press and hold a tab, or choose **Add a stream to multi-view** in the ⋮ menu and then tap a tab. In multi-view, tapping a tab replaces the stream that has the sound.

When an update is ready, a bar at the top offers to refresh into it. The ⋮ button at the end of the tab row slides out a row of icons: Refresh app, Picture-in-picture, Add a stream to multi-view, Cast to TV, Reload chat, Install (when available) and the gear for settings. ✕ puts them away. Settings has the toggles (keep the screen on, show chat, play Kick in the app's own player), the app's version and what changed in it; older versions are folded under **Earlier versions**. The full history is in `CHANGELOG.md`.

## Installing

Android (Chrome): use the Install button in the bar at the top, or tap ⋮ then **Add to home screen → Install**. iPhone and iPad (Safari): tap Share, then **Add to Home Screen**. Desktop Chrome and Edge show an install icon in the address bar.

For sound with the screen locked on Android, Chrome has to be allowed to run in the background. On Samsung phones, check **Settings → Battery → Background usage limits** and make sure Chrome isn't a sleeping app.

## Limits

Lock-screen audio, picture-in-picture on phones and Chromecast casting work for Kick only. AngelThump streams are slow to start and often buffer on destiny.gg too: AngelThump's player is a large app that loads late, it asks for a token before playing, it offers only full quality (about 8 Mbps) with no lower versions for mobile data, and it keeps a very small buffer for low latency. For sound on AngelThump and Rumble, use the player's own speaker button. Twitch, YouTube, AngelThump and Rumble play in their sites' own players, which the app can't control. Twitch blocks other sites from loading its streams directly, YouTube ties its streams to its own player, and AngelThump only gives its streams to its own player. On Android, those players can still float if you make them fullscreen and press home.

Chat uses destiny.gg's own login. The app can't tell whether you're logged in. If chat shows you logged out, log in on destiny.gg in Chrome, then use **Reload chat** in the menu.

## Privacy

The app has no accounts, analytics or tracking, and nothing in it identifies whoever runs it. Settings stay in each viewer's own browser. The server relays destiny.gg's public embed list and Kick playlists and serves the app's files, and its code doesn't record visitors. It counts requests per IP address in memory, only to enforce its limits, and forgets them within minutes. When the browser blocks something under the app's Content-Security-Policy, the server logs which site was blocked, nothing about the visitor. Railway, the host, keeps its own request logs (IP address and browser for each request), which only the project's owner can see.

## Development

`server.js` is a small Node server. It serves the app from `public/`, relays destiny.gg's live embed list at `/api/embeds` (a snapshot) and `/api/live` (server-sent events), and relays Kick stream playlists at `/api/stream/kick/<channel>.m3u8`, with per-visitor limits on both. It serves the app's files compressed, with content-hashed URLs, a Content-Security-Policy, its own pinned copy of hls.js, and `changelog.json` built from `CHANGELOG.md`. The `Dockerfile` builds it, and Railway redeploys on every push to the connected branch. The build also makes the app icons: `scripts/make-icons.mjs` downloads destiny.gg's current icon and adds the REMIX tag from `icon-src/remix-tag.png`, keeping the committed icons if the download fails.

The app is plain JavaScript modules in `public/js/` with no build step; `public/js/main.js` lists what each one does.

To run it locally: `npm install`, then `npm start`, then open http://localhost:8080. `npm run check` runs ESLint, Prettier and the unit tests in `test/` (the same checks GitHub Actions runs on every push), and Dependabot opens pull requests for dependency updates. `dev/` has a fake destiny.gg feed, a browser smoke test (`dev/smoke.mjs`) and a screen-size check that screenshots phone, tablet, desktop and ultrawide sizes (`dev/screens.mjs`). `CLAUDE.md` explains how the code is laid out and has the full testing checklist for Chrome, Safari, Firefox and Edge on Android, iPhone, iPad, macOS and Windows, including the installed app. Ideas for what to build next are in `IDEAS.md`.

## License

MIT, see `LICENSE`. DGG Remix is a fan project and isn't affiliated with destiny.gg; destiny.gg's name and logo belong to their owners.
