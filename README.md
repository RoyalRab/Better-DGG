# Better DGG

An installable web app that shows a stream with destiny.gg chat underneath it (or beside it in landscape). It keeps the phone screen on while it's open, and it tries to keep the stream's audio playing after the phone locks.

## What it does

The stream player sits on top and `destiny.gg/embed/chat` fills the rest of the screen. Turn the phone sideways and chat moves to the right. The chat bubble button hides chat so the player gets the whole screen.

While the app is open and visible, it holds a [Screen Wake Lock](https://developer.mozilla.org/docs/Web/API/Screen_Wake_Lock_API), so the screen doesn't dim or sleep. The sun icon in the top bar turns yellow while the lock is held. Tap it to turn it off.

YouTube and Twitch players pause themselves when the page is hidden. Better DGG watches for that pause, and if it happens within a few seconds of the screen locking, it starts the player again. A pause you make later, for example from the lock screen controls, is left alone. Kick and Rumble players don't offer a way to be controlled from outside, so for them it depends on whether their player keeps playing in the background on its own.

You pick the stream from the top-left button. You can paste a Kick, YouTube, Twitch, Rumble or Vimeo link, or a DGG chat embed such as `#kick/destiny`, `#youtube/VIDEO_ID` or `#twitch-vod/ID`. The URL hash works the same way, so adding `#kick/destiny` to the app's URL opens straight to that stream. The last few streams are kept as one-tap shortcuts. Kick VODs, Facebook and AngelThump embeds open on destiny.gg's bigscreen instead.

The **Embeds** button lists what people in DGG chat are embedding, like the list on destiny.gg's bigscreen. The server stays connected to destiny.gg chat as an anonymous reader and counts the `#platform/id` links posted in the last 10, 30 or 60 minutes. Each person counts once per link. Tap an entry to switch to it. YouTube entries show the video title. The list only covers time since the server last started, so it's empty for a little while after each deploy.

Chrome only lets a player start with sound after you tap something on the page, so when the app opens it shows a play button instead of starting muted. The speaker button in the top bar turns the sound back on if a player still comes up muted.

## Putting it online

It runs on Railway at https://better-dgg.up.railway.app. `server.js` is a small Node server that serves the app from `public/` and keeps the chat connection for the embed list, and the `Dockerfile` builds it. Railway redeploys whenever the connected branch gets a push.

To run it locally: `npm install`, then `npm start`, then open http://localhost:8080.

## Installing on Android (Chrome)

Open the app's URL in Chrome, tap the ⋮ menu, then **Add to home screen → Install**. It gets its own icon and opens full screen without the browser bar. Chrome also lets installed apps autoplay with sound, which saves a tap when it opens.

For audio with the screen locked, Android has to be allowed to keep Chrome running. On Samsung phones, go to **Settings → Battery → Background usage limits** and make sure Chrome isn't in "Sleeping apps" or "Deep sleeping apps". Setting Chrome's battery usage to **Unrestricted** (long-press Chrome → App info → Battery) also helps.

## Known limits

Chat logins depend on how destiny.gg sets its login cookie. If chat shows you as logged out inside the app, use **Log in to destiny.gg** in the menu, then **Reload chat**. If it still shows you logged out, destiny.gg isn't sending its login cookie to embedded chat, and chat inside this app will be read-only.

Rumble needs the embed link (`rumble.com/embed/…`) or the `#rumble/ID` form from DGG chat. A normal Rumble video page link uses a different ID and won't work.

## Files

`public/` holds the app: `index.html`, `app.css` and `app.js`, plus `manifest.webmanifest`, `sw.js` and `icons/` for installing it. `server.js` serves those files and builds the embed list at `/api/embeds?minutes=30`.
