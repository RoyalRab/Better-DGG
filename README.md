# DGG Remix

An unofficial, fan-made web app for watching destiny.gg's live embeds with chat. It works on Android, iPhone, iPad and other tablets, desktop browsers and ultrawide screens, and it can be installed to the home screen. It isn't affiliated with destiny.gg.

Live at https://better-dgg.up.railway.app

## What it does

The stream sits on top with `destiny.gg/embed/chat` below it. On landscape phones, tablets, desktops and ultrawides, chat moves to the right. There's no top bar; the ⋮ menu sits at the right end of the tab row. **Show chat** in the menu hides chat so the stream gets the whole screen, and **Refresh app** reloads it.

Under the player is a row of tabs with every live stream DGG viewers are embedding on the bigscreen right now, from Kick, Twitch, YouTube, AngelThump and Rumble, plus Destiny's own stream when he's live. VODs, clips and ordinary videos are left out. The list comes from the same live feed destiny.gg's bigscreen uses (`wss://live.destiny.gg`). The server holds one connection to that feed and pushes every change to open apps right away, so the tabs update as soon as someone embeds something. Tap a tab to switch to it. When the app opens without a link, it picks the last stream you watched if it's still live, otherwise Destiny if he's live, otherwise the first tab. A stream on screen that drops out of the list keeps a dimmed tab.

**Multi-view.** Tapping a tab switches the stream you're watching. To watch more than one at once, choose **Add a stream to multi-view** in the menu and then tap a tab, or press and hold a tab, and that stream is added beside the others (up to four). Each stream gets a small label with a speaker button that moves the sound to it, and an ✕ to remove it. Tapping a tab while in multi-view swaps out the stream that has the sound. On wide screens the app picks the grid that gives each stream the most room. The address bar lists the streams on screen (for example `#kick/destiny,twitch/name`), so a multi-view setup can be shared as a link.

**Screen stays on.** While the app is open it holds a [Screen Wake Lock](https://developer.mozilla.org/docs/Web/API/Screen_Wake_Lock_API). It can be turned off in the menu.

**Keeps playing when the phone locks.** Chrome on Android pauses every video when the screen locks or you switch apps, but it lets audio-only playback continue. So for Kick streams, which the app plays itself with [hls.js](https://github.com/video-dev/hls.js), whenever Chrome pauses the stream with sound because the page is hidden (including when the screen locks while it's in picture-in-picture), the app carries on with an audio-only copy and switches back to the video when you return. Pausing it yourself from the lock screen or the floating window keeps it paused. Kick doesn't offer an audio-only version, so the audio copy is the same stream with the video track dropped before it reaches the browser. The server gets each channel's stream from Kick's public channel API; if the app's player hasn't started within a few seconds, it falls back to Kick's player. Twitch, YouTube, AngelThump and Rumble play in their sites' own players, which the app can't switch to audio, so they stop when the screen locks.

**Picture-in-picture.** **Picture-in-picture** in the menu pops the stream with sound out into a floating window. Kick streams in the app's own player can do this on Android, iPhone, iPad and desktop, and where the browser supports it they pop out on their own when you leave the app. When that happens the video keeps playing in the floating window until the screen locks, and then the sound carries on from the audio-only copy. Twitch and YouTube players pop out automatically only if they're fullscreen when you press home; that's Chrome's own behavior and the app can't trigger it for them. Other streams play in their sites' players, which the app can't pop out on phones; on desktop Chrome and Edge the button moves the whole player into a floating window instead (it reloads when it moves). The menu item only shows when picture-in-picture is possible for the current stream.

**Autoplay.** Streams start on their own. The app checks at startup whether the browser allows sound before your first tap (installed apps usually are allowed) and starts every player with sound when it can; otherwise the stream plays muted with a **Tap for sound** button over it. If a player fails to load, a **Try again** button reloads it.

**Cast to TV.** Kick streams in the app's own player can be cast straight to a Chromecast from **⋮ → Cast to TV → Cast this stream**, or from the cast icon in the player's controls, where the browser supports it (Chrome on Android does). Other streams play in their sites' players, so the Cast to TV page lists the options for the device you're on: screen casting (Smart View, Screen cast or AirPlay mirroring) on phones and tablets, Chrome's Cast tab on desktop, or the cast icon inside YouTube and Twitch players.

## Installing

The app shows an install bar under the header until it's installed or dismissed (it comes back after a week). In Chrome and Edge its Install button installs in one tap; on iPhone and in in-app browsers it explains how. Android (Chrome): tap ⋮, then **Add to home screen → Install**. iPhone and iPad (Safari): tap Share, then **Add to Home Screen**. Desktop Chrome and Edge show an install icon in the address bar.

For audio with the screen locked on Android, Chrome has to be allowed to run in the background. On Samsung phones, check **Settings → Battery → Background usage limits** and make sure Chrome isn't a sleeping app.

## Known limits

Chat logins depend on destiny.gg's login cookie. If chat shows you logged out, use **Log in to destiny.gg** in the menu, then **Reload chat**. If you're still logged out, chat inside the app will be read-only.

## Privacy

The app has no accounts, analytics or tracking, and nothing in it identifies whoever runs it. Settings stay in each viewer's own browser. The server relays destiny.gg's public embed list and Kick playlists and serves the app's files, and its code doesn't record visitors. Railway, the host, keeps its own request logs (IP address and browser for each request), which only the project's owner can see.

## Running it

`server.js` is a small Node server that serves the app from `public/` and relays the live embed list at `/api/embeds` (a snapshot) and `/api/live` (server-sent events), and relays Kick stream playlists at `/api/stream/kick/<channel>.m3u8`. The `Dockerfile` builds it, and Railway redeploys on every push to the connected branch.

The app icon is destiny.gg's current icon with a REMIX tag. `scripts/make-icons.mjs` downloads it and adds the tag (`icon-src/remix-tag.png`) during the Docker build; if the download fails, the icons already in `public/icons` are used.

To run it locally: `npm install`, then `npm start`, then open http://localhost:8080.
