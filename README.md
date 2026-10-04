# Better DGG Pro

An unofficial, fan-made web app for watching destiny.gg's live embeds with chat. It works on Android, iPhone, iPad and other tablets, desktop browsers and ultrawide screens, and it can be installed to the home screen. It isn't affiliated with destiny.gg.

Live at https://better-dgg.up.railway.app

## What it does

The stream sits on top with `destiny.gg/embed/chat` below it. On landscape phones, tablets, desktops and ultrawides, chat moves to the right. The chat button in the top bar hides chat so the stream gets the whole screen.

Under the player is a row of tabs with every live stream DGG viewers are embedding on the bigscreen right now, from Kick, Twitch, YouTube, AngelThump and Rumble, plus Destiny's own stream when he's live. VODs, clips and ordinary videos are left out. The list comes from the same live feed destiny.gg's bigscreen uses (`wss://live.destiny.gg`). The server holds one connection to that feed and pushes every change to open apps right away, so the tabs update as soon as someone embeds something. Tap a tab to switch to it.

**Multi-view.** The grid button turns on multi-view. Tap tabs to add up to four streams; tap one again to take it out. Each stream gets a small label with a speaker button that moves the sound to that stream, and an ✕ to remove it. On wide screens the app picks the grid that gives each stream the most room. The address bar lists the streams on screen (for example `#kick/destiny,twitch/name`), so a multi-view setup can be shared as a link.

**Screen stays on.** While the app is open it holds a [Screen Wake Lock](https://developer.mozilla.org/docs/Web/API/Screen_Wake_Lock_API). The sun icon turns yellow while the lock is held; tap it to turn it off.

**Keeps playing when the phone locks.** Kick streams play in the app's own video player by default. The server gets each channel's stream from Kick's public channel API, and the app plays it directly, so sound keeps going when the screen locks and the lock screen shows play and pause controls. If that fails, the app falls back to Kick's player. YouTube and Twitch players pause themselves when the page is hidden; if that happens within a few seconds of the screen locking, the app starts them again. AngelThump and Rumble players can't be controlled from outside, and AngelThump streams need a token only its own player can get, so for those it depends on their player.

**Sound.** Browsers only let a player start with sound after a tap, so when the app opens it shows a play button instead of starting muted. If a stream still comes up muted, the speaker button in the top bar turns its sound on.

**Cast to TV.** Kick streams in the app's own player can be cast straight to a Chromecast from **⋮ → Cast to TV → Cast this stream**, or from the cast icon in the player's controls, where the browser supports it (Chrome on Android does). Other streams play in their sites' players, so the Cast to TV page lists the options for the device you're on: screen casting (Smart View, Screen cast or AirPlay mirroring) on phones and tablets, Chrome's Cast tab on desktop, or the cast icon inside YouTube and Twitch players.

## Installing

Android (Chrome): open the site, tap ⋮, then **Add to home screen → Install**. iPhone and iPad (Safari): tap Share, then **Add to Home Screen**. Desktop Chrome and Edge show an install icon in the address bar.

For audio with the screen locked on Android, Chrome has to be allowed to run in the background. On Samsung phones, check **Settings → Battery → Background usage limits** and make sure Chrome isn't a sleeping app.

## Known limits

Chat logins depend on destiny.gg's login cookie. If chat shows you logged out, use **Log in to destiny.gg** in the menu, then **Reload chat**. If you're still logged out, chat inside the app will be read-only.

## Privacy

The app has no accounts, analytics or tracking. Settings stay in your own browser. The server relays destiny.gg's public embed list and serves the app's files; it doesn't log who visits.

## Running it

`server.js` is a small Node server that serves the app from `public/` and relays the live embed list at `/api/embeds` (a snapshot) and `/api/live` (server-sent events), and relays Kick stream playlists at `/api/stream/kick/<channel>.m3u8`. The `Dockerfile` builds it, and Railway redeploys on every push to the connected branch.

To run it locally: `npm install`, then `npm start`, then open http://localhost:8080.
