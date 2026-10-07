# DGG Remix

An unofficial, fan-made web app for watching destiny.gg's live embeds with chat, built for an improved mobile experience. It also works on tablets, desktop browsers and ultrawide screens, and it installs to the home screen like an app. It isn't affiliated with destiny.gg.

Live at https://mobile-dgg.com (also https://dggremix.up.railway.app)

## What's different from destiny.gg

Chat is destiny.gg's own chat, and the list of live embeds comes from the same feed destiny.gg's bigscreen uses, so those behave the same. Everything below is what DGG Remix adds or changes.

### Mobile experience (phones and tablets)

| Feature | What it does |
| --- | --- |
| Keeps playing when the screen locks | Kick streams keep their sound when you lock the phone or switch apps. Chrome on Android pauses video in the background, so the app switches to an audio-only copy of the stream and back to the video when you return. |
| Lock screen controls | Play, pause, next and previous from the lock screen and notification, with the stream's name. Next and previous step through the live embeds, and earbud buttons do the same. |
| Sleep timer | Settings → Sleep timer pauses the stream after 15, 30 or 60 minutes, for falling asleep listening. |
| Landscape fullscreen | Settings can make a phone turned sideways show only the stream, with chat as a see-through panel on the right (a button hides it) and the tabs a tap on the stream or the handle at the bottom away. |
| Audio only | Settings can play Kick streams as sound only in the app's own player: no picture, less data and battery. |
| Data saver | On mobile data, Kick streams in the app's own player stay at 480p or below (on by default, where the browser reports the connection type: Chrome on Android does). |
| Home screen shortcuts | Long-press the app icon for **Destiny's stream** or **Multi-view** (your last multi-view set). |
| Share into the app | Share a Kick, Twitch, YouTube, AngelThump or Rumble link from another app to DGG Remix to open it (Android, installed app). |
| Haptic tap | A short buzz confirms that holding a tab added it to multi-view. |
| Swipe to switch | Swipe left or right across the player to go to the next or previous live embed (over Kick's player and while a stream loads; Twitch, YouTube and AngelThump take the touch themselves). |
| Screen stays on | The phone doesn't dim or sleep while the app is open (can be turned off in settings). |
| Installable app | Installs to the home screen with its own icon and opens full screen without the browser bar. Every browser gets told how: a bar at the top installs in one tap where the browser allows it and otherwise opens the steps, the ⋮ row has an Install button, and Settings → **Get the app** gives the steps for your browser with every other browser folded underneath. A dismissed bar comes back after a week, and it stays away once the app is installed. |
| Picture-in-picture | Pops the stream into a floating window from the ⋮ row (P on desktop). Desktop Chrome can also pop a Kick stream out by itself when you switch tabs. |
| Autoplay with sound | Streams start by themselves. In the installed app they usually start with sound; otherwise there's one **Tap for sound** button (**Click for sound** on desktop). Twitch starts muted on phones and the sound comes on a moment later, or the button appears when the phone won't allow it. |
| More room for the stream | No top bar. The player starts at the top of the screen, with a short tab row under it and the ⋮ button at the end of the row. |
| One-tap switching | Every live embed is a tab under the player. Tap to switch, press and hold to add it to multi-view (a one-time tip says so). A stream starts loading the moment your finger touches its tab. |
| Phone layouts | Portrait stacks player, tabs and chat. Landscape puts chat on the right with the tab row above it, so the stream gets the whole height. Chat can be hidden to give the stream the whole screen. |
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
| Favorites | ★ in the ⋮ row pins the current stream to the front of the tab row (after Destiny), with a star on its tab. |
| Themes | Settings → Theme: Dark, Purple, Synthwave, Glitchwave (Blood Dragon neon), OLED black, Kick green, or Custom with your own background and accent colours. Chat is destiny.gg's page and keeps its own look. |
| More from destiny.gg | Settings link to the rest of the site, as destiny.gg's own menu does: Subscribe, Donate, Merch, VODs, Events, Schedule, TTS queue, The Vault and the Wiki. |
| Pop out chat | On desktop, Settings → Chat account has **Pop out chat**, which opens destiny.gg's chat in its own small window (the bigscreen's Popout). |
| Hidden banned embeds | Embeds destiny.gg's mods have banned stay off the list, as on the bigscreen. |
| Hosted stream | When destiny.gg hosts someone, the hosted stream is a tab right after Destiny's. |
| Stream ended | When the stream you're watching leaves the live list, a notice offers the most-embedded live stream. |
| Keyboard shortcuts | On desktop: 1–9 switch tabs, ← → previous and next, M add to multi-view, C chat, F fullscreen, P picture-in-picture. |
| Chat on the left | Settings can put chat on the left in landscape and on desktop. |
| Remembers volume | Kick streams in the app's own player keep their own volume. |
| Focus layout | In multi-view, a ⋮ button makes the stream with the sound big and the others small (in a row underneath on a phone, stacked beside it on a wider screen). |
| Stream previews | Rest the mouse on a tab, or hold it on a phone, to see a picture of what's on before switching. |
| Latest from Destiny | While nothing of his is live, settings list his newest YouTube videos and Kick VODs, and they play in the app. |
| Kick VODs and clips | Links to Kick VODs and clips open in the app's own player, and the hash form destiny.gg uses (`#kick-vod/...`) works too. |
| Live notifications | Settings → Notifications can tell you when Destiny goes live, even with the app closed (on iPhone and iPad only as an installed app). |
| YouTube videos | YouTube videos that chatters embed show up as tabs next to the live streams (a small ▶ marks them), so you can watch along. A YouTube link shared to the app, or a `#youtube/<id>` link, plays too. |
| Kick quality | Settings cap the quality of Kick streams in the app's own player (Auto, or up to 1080p, 720p, 480p or 360p) for a steadier picture on a slow connection. |
| Error reports | Optional, off by default: when a player fails, the app sends what failed, its version and the kind of browser to the server log. Nothing about you. |
| Real-time embed tabs | The tab row updates the moment someone embeds something, with live streams only (no VODs, clips or ordinary videos), each with its platform icon. The list recovers on its own after the phone changes networks. |
| Opens on something live | Opens the last stream you watched if it's still live, then Destiny if he's live, then the first tab. A stream on screen that ends keeps a dimmed tab. |
| Multi-view | Up to four streams at once, with a speaker button on each to move the sound and an ✕ to remove it. The grid is sized to give each stream the most room, including on ultrawides. The address bar link reopens the same set. |
| Kick in the app's own player | Kick streams play in the app's own player ([hls.js](https://github.com/video-dev/hls.js)), which is what makes lock-screen audio, picture-in-picture and Chromecast possible. It falls back to Kick's player if it can't start. |
| Desktop extras | Mouse wheel scrolls the tab row, right-click a tab to add it to multi-view, and picture-in-picture works for any stream in Chrome and Edge. |
| Smooth switching | The stream you're leaving stays on screen until the new one starts, with a loading spinner instead of a black box. At startup the player, tabs and chat show placeholders until they're ready. A Kick stream you switch away from keeps running hidden and muted for a minute, so switching back is instant (this uses some data). |
| Stays live | Kick streams in the app's own player aim for about 5 s behind the newest video Kick has published (Kick's own player gets a little closer by reading segments as they're written, which the app's player can't), and catch back up after buffering (faster playback, or a jump if far behind). When one is still behind, a button says how many seconds and jumps to live; nothing covers the picture while it's live. |
| Resizable chat | In landscape and on desktop, drag the line between the stream and chat (or use the arrow keys on it) to change chat's width; the tab row above chat follows. Double-click resets it. |
| What's new | Settings list what changed in each version, and a bar mentions it once after an update. |
| Accessible | Visible keyboard focus, a label on every button, stream changes announced to screen readers, and less motion when the system asks for it. |
| Recovers from errors | A **Try again** button when a player fails to load. A frozen Kick stream reloads itself, a **Jump to live** button appears when it falls behind, and a Kick stream that drops for a moment is waited for rather than handed to Kick's player. |
| Remembers multi-view | Offers to restore your last multi-view set when you open the app. |
| Smooth deploys | New versions only take over once they're running, and open apps reconnect to the live tabs within a second. |

## Using it

Tap a tab to watch it. To watch more than one stream, press and hold a tab, or choose **Add a stream to multi-view** in the ⋮ menu and then tap a tab. In multi-view, tapping a tab replaces the stream that has the sound.

When an update is ready, a bar at the top offers to refresh into it. The ⋮ button at the end of the tab row slides out a row of icons: Refresh app, Picture-in-picture, Add a stream to multi-view, Cast to TV, Reload chat, Install (when available) and the gear for settings. ✕ puts them away; a one-time tip points it out, and settings list the same actions with their names. Settings has the toggles (keep the screen on, show chat, chat on the left, play Kick in the app's own player, error reports), the theme picker, the sleep timer, a Chat account section (**Sign in** and **Sign out**, which open destiny.gg; **Pop out chat** on desktop), a **Share link** button, **Get the app** (install steps for your browser), **More from destiny.gg** (links to the rest of the site), **Suggest an idea** and **Report a problem** buttons, the app's version and what changed in it; older versions are folded under **Earlier versions**. The full history is in `CHANGELOG.md`.

## Installing

The app tells you how on whatever you open it in: the bar at the top installs in one tap in Chrome and Edge, and elsewhere its **How** button (or ⋮ → Install app, or Settings → **Get the app**) shows the steps for your browser. In short:

| Where | How |
| --- | --- |
| Chrome on Android | **Install** in the bar at the top, or ⋮ → Add to Home screen → Install |
| Samsung Internet | The install icon in the address bar, or ☰ → Add page to → Home screen |
| Firefox on Android | ⋮ → Install |
| Edge on Android | ⋯ → Add to phone → Install |
| An app's built-in browser (Discord, Reddit, X…) | Open the link in Chrome first (⋮ → Open in Chrome) |
| Safari on iPhone and iPad | Share → **Add to Home Screen** → Add (other iOS browsers: the same under Share or ⋮, or do it in Safari) |
| Chrome and Edge on a computer | The install icon at the right end of the address bar, or ⋮ → Cast, save and share → Install page as app (Edge: ⋯ → Apps → Install this site as an app) |
| Safari on a Mac | File → Add to Dock |
| Firefox on a computer | No app install; pin the tab or bookmark it, or install from Chrome, Edge or Safari |

For sound with the screen locked on Android, Chrome has to be allowed to run in the background. On Samsung phones, check **Settings → Battery → Background usage limits** and make sure Chrome isn't a sleeping app.

## Limits

Lock-screen audio, picture-in-picture on phones and Chromecast casting work for Kick only. Live notifications need a browser with web push: on iPhone and iPad that means the installed app (iOS 16.4+), and Firefox on Android has none. AngelThump streams are slow to start and often buffer on destiny.gg too: AngelThump's player is a large app that loads late, it asks for a token before playing, it offers only full quality (about 8 Mbps) with no lower versions for mobile data, and it keeps a very small buffer for low latency. For sound on AngelThump and Rumble, use the player's own speaker button. Twitch, YouTube, AngelThump and Rumble play in their sites' own players, which the app can't control. Twitch blocks other sites from loading its streams directly, YouTube ties its streams to its own player, and AngelThump only gives its streams to its own player. On Android, those players can still float if you make them fullscreen and press home. Android doesn't let a web app pop a video out on its own when you press Home: the app tried from 1.7.1 to 1.7.4 and came back as a blank white screen, so a pop-out is a tap on the ⋮ button, and the sound carries on in the background either way.

Chat uses destiny.gg's own login. The app can't tell whether you're signed in, so settings offer both **Sign in** and **Sign out**: each opens destiny.gg (sign-out is in the account menu there, since destiny.gg signs out with a form only its own page can send), and chat reloads when you come back. The chat's own **log in** link does the same: it opens destiny.gg's sign-in page in a new tab, since that page can't be shown inside the app. Chat is destiny.gg's page inside the app, so it only sees your login if the browser allows "third-party cookies" for it. Chrome and Edge do by default; Samsung Internet, Firefox, Safari and any private window don't, and chat then shows you signed out even after signing in. **Chat still shows you signed out?** under Chat account in settings gives the steps for your browser (for example Chrome on Android: ⋮ → Settings → Site settings → Third-party cookies). On an iPhone, sign in and use the app in Safari with Prevent Cross-Site Tracking off; the home-screen app keeps its own separate login.

## Ideas and problems

Settings has **Suggest an idea** and **Report a problem** buttons, which open short forms on this repository's [issues page](https://github.com/RoyalRab/Better-DGG/issues) (a GitHub account is needed to post). The problem form is pre-filled with the app version, the kind of browser and screen size, which you can edit before posting. The owner's own backlog is in `IDEAS.md`.

## Privacy

The app has no accounts, analytics or tracking, and nothing in it identifies whoever runs it. Settings stay in each viewer's own browser. The server relays destiny.gg's public embed list and Kick playlists and serves the app's files, and its code doesn't record visitors. It counts requests per IP address in memory, only to enforce its limits, and forgets them within minutes. When the browser blocks something under the app's Content-Security-Policy, the server logs which site was blocked, nothing about the visitor. Railway, the host, keeps its own request logs (IP address and browser for each request), which only the project's owner can see.

## Development

`server.js` is a small Node server. It serves the app from `public/`, relays destiny.gg's live embed list at `/api/embeds` (a snapshot) and `/api/live` (server-sent events), and relays Kick stream playlists at `/api/stream/kick/<channel>.m3u8`, with per-visitor limits on both. It serves the app's files compressed, with content-hashed URLs, a Content-Security-Policy, its own pinned copy of hls.js, and `changelog.json` built from `CHANGELOG.md`. The `Dockerfile` builds it, and Railway redeploys on every push to the connected branch. The build also makes the app icons: `scripts/make-icons.mjs` downloads destiny.gg's current icon and adds the REMIX tag from `icon-src/remix-tag.png`, keeping the committed icons if the download fails.

The app is plain JavaScript modules in `public/js/` with no build step; `public/js/main.js` lists what each one does.

To run it locally: `npm install`, then `npm start`, then open http://localhost:8080. `npm run check` runs ESLint, Prettier and the unit tests in `test/` (the same checks GitHub Actions runs on every push), and Dependabot opens pull requests for dependency updates. `dev/` has a fake destiny.gg feed, a browser smoke test (`dev/smoke.mjs`) and a screen-size check (both need Playwright: `npm i -g playwright && npx playwright install chromium`, or set `PLAYWRIGHT` and `CHROMIUM` to your own copies) that screenshots phone, tablet, desktop and ultrawide sizes (`dev/screens.mjs`). `CLAUDE.md` explains how the code is laid out and has the full testing checklist for Chrome, Safari, Firefox and Edge on Android, iPhone, iPad, macOS and Windows, including the installed app. Ideas for what to build next are in `IDEAS.md`.

### A real button on donations (SwitchBot)

The server can press a physical button when someone donates in destiny.gg chat, through a [SwitchBot Bot](https://www.switch-bot.com/products/switchbot-bot) (the little button pusher) and SwitchBot's cloud API. It needs a SwitchBot hub so the Bot is reachable from the internet. Set these variables on the server (on Railway, under the service's Variables): `SWITCHBOT_TOKEN` and `SWITCHBOT_SECRET` from the SwitchBot app (Profile → Preferences → tap App Version ten times → Developer Options), and `SWITCHBOT_DEVICE`, the Bot's id, which `SWITCHBOT_TOKEN=... SWITCHBOT_SECRET=... node scripts/switchbot-devices.js` prints. With those set, the server watches chat and presses once per donation, one press at a time, 3 s apart. Optional: `SWITCHBOT_EVENTS` chooses what counts (`donation`, `subscription`, `giftsub`, `massgift`, comma separated; donations only by default), `SWITCHBOT_MIN_AMOUNT` is a dollar floor for donations, and `SWITCHBOT_COMMAND` is `press` by default (`turnOn` or `turnOff` for a Bot in switch mode). The server log shows `switchbot: on` at start, `chat: connected`, and `switchbot: pressed for donation of $5.00 by <name>` or `switchbot: failed for ...` with SwitchBot's answer. Without the variables, nothing connects to chat.

## Contributing

Issues and pull requests are welcome. `AGENTS.md` and `CLAUDE.md` explain the code, the decisions already made and how to test; `npm run check` runs the same checks as CI. Nothing needs a key or a login.

## License

MIT, see `LICENSE`. The license covers the code. DGG Remix is a fan project and isn't affiliated with destiny.gg; destiny.gg's name and logo belong to their owners, and the app icons in `public/icons` (derived from that logo) aren't covered by the MIT license.
