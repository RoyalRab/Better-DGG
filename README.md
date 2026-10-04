# DGG Remix

An unofficial, fan-made web app for watching destiny.gg's live embeds with chat, built for an improved mobile experience. It also works on tablets, desktop browsers and ultrawide screens, and it installs to the home screen like an app. It isn't affiliated with destiny.gg.

Live at https://better-dgg.up.railway.app

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
| More room for the stream | No top bar. The player starts at the top of the screen, with a short tab row under it and the ⋮ menu at the end of the row. |
| One-tap switching | Every live embed is a tab under the player. Tap to switch, press and hold to add it to multi-view. |
| Phone layouts | Portrait stacks player, tabs and chat. Landscape puts chat on the right. Chat can be hidden to give the stream the whole screen. |
| Cast to TV help | Device-specific steps for screen casting (Smart View, Screen cast, AirPlay), plus direct Chromecast casting for Kick streams. |
| Refresh button | Reloads the installed app, which has no pull-to-refresh. |

### Everywhere

| Feature | What it does |
| --- | --- |
| Real-time embed tabs | The tab row updates the moment someone embeds something, with live streams only (no VODs, clips or ordinary videos), each with its platform icon. |
| Opens on something live | Opens the last stream you watched if it's still live, then Destiny if he's live, then the first tab. A stream on screen that ends keeps a dimmed tab. |
| Multi-view | Up to four streams at once, with a speaker button on each to move the sound and an ✕ to remove it. The grid is sized to give each stream the most room, including on ultrawides. The address bar link reopens the same set. |
| Kick in the app's own player | Kick streams play in the app's own player ([hls.js](https://github.com/video-dev/hls.js)), which is what makes lock-screen audio, picture-in-picture and Chromecast possible. It falls back to Kick's player if it can't start. |
| Desktop extras | Mouse wheel scrolls the tab row, right-click a tab to add it to multi-view, and picture-in-picture works for any stream in Chrome and Edge. |
| Recovers from errors | A **Try again** button when a player fails to load. |

## Using it

Tap a tab to watch it. To watch more than one stream, press and hold a tab, or choose **Add a stream to multi-view** in the ⋮ menu and then tap a tab. In multi-view, tapping a tab replaces the stream that has the sound.

The ⋮ menu has the settings (keep the screen on, show chat, play Kick in the app's own player) and Refresh app, Picture-in-picture, Add a stream to multi-view, Cast to TV and Reload chat.

## Installing

Android (Chrome): use the Install button in the bar at the top, or tap ⋮ then **Add to home screen → Install**. iPhone and iPad (Safari): tap Share, then **Add to Home Screen**. Desktop Chrome and Edge show an install icon in the address bar.

For sound with the screen locked on Android, Chrome has to be allowed to run in the background. On Samsung phones, check **Settings → Battery → Background usage limits** and make sure Chrome isn't a sleeping app.

## Limits

Lock-screen audio, picture-in-picture on phones and Chromecast casting work for Kick only. Twitch, YouTube, AngelThump and Rumble play in their sites' own players, which the app can't control. Twitch blocks other sites from loading its streams directly, YouTube ties its streams to its own player, and AngelThump only gives its streams to its own player. On Android, those players can still float if you make them fullscreen and press home.

Chat uses destiny.gg's own login. The app can't tell whether you're logged in. If chat shows you logged out, log in on destiny.gg in Chrome, then use **Reload chat** in the menu.

## Privacy

The app has no accounts, analytics or tracking, and nothing in it identifies whoever runs it. Settings stay in each viewer's own browser. The server relays destiny.gg's public embed list and Kick playlists and serves the app's files, and its code doesn't record visitors. Railway, the host, keeps its own request logs (IP address and browser for each request), which only the project's owner can see.

## Development

`server.js` is a small Node server. It serves the app from `public/`, relays destiny.gg's live embed list at `/api/embeds` (a snapshot) and `/api/live` (server-sent events), and relays Kick stream playlists at `/api/stream/kick/<channel>.m3u8`. The `Dockerfile` builds it, and Railway redeploys on every push to the connected branch. The build also makes the app icons: `scripts/make-icons.mjs` downloads destiny.gg's current icon and adds the REMIX tag from `icon-src/remix-tag.png`, keeping the committed icons if the download fails.

To run it locally: `npm install`, then `npm start`, then open http://localhost:8080. `dev/` has a fake destiny.gg feed and a browser smoke test; see `CLAUDE.md` for how the code is laid out and how to test it. Ideas for what to build next are in `IDEAS.md`.
