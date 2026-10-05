# Changelog

What changed in each version of DGG Remix. The newest version is listed in the app's settings, with older ones folded underneath. Add an entry here with every version bump.

## 1.2.1 (2026-10-05)

- Kick streams in the app's own player stay closer to live: about 5 seconds behind instead of 10 to 15, and they catch up faster after buffering.
- No more empty band above the Android buttons after an update or Refresh.

## 1.2.0 (2026-10-05)

- Sleep timer in settings: pauses the stream after 15, 30 or 60 minutes.
- Favorites: ★ in the ⋮ row pins the current stream to the front of the tab row.
- Embeds banned by destiny.gg's mods stay off the list, and a stream destiny.gg hosts gets a tab after Destiny's.
- When the stream you're watching leaves the live list, a notice offers the most-embedded live stream.
- Long-press the app icon for Destiny's stream or your last multi-view; share a stream link from another app to open it here (Android).
- Desktop keyboard shortcuts: 1–9, ← →, M, C, F, P. Chat can go on the left.
- Kick streams in the app's own player remember their volume. Holding a tab buzzes once when it adds.
- Optional error reports (off by default) send player failures to the server log, with nothing about you.

## 1.1.0 (2026-10-05)

- Next and previous buttons on the lock screen, in the notification and on earbuds step through the live embeds.
- Swipe left or right across the player to switch embeds (over Kick's player and while a stream loads).

## 1.0.8 (2026-10-05)

- Tablets: the chat box stays clear of the taskbar after Refresh or an update (Android tablets present themselves as desktop browsers, so the padding fallback skipped them).

## 1.0.7 (2026-10-05)

- Twitch streams no longer sit on Twitch's play button on phones: they start muted, the sound comes on a moment later, and if the phone won't allow that the stream keeps playing with the Tap for sound button.

## 1.0.6 (2026-10-05)

- The chat's own "log in" link no longer leaves the chat panel blank with a broken-page icon: it opens destiny.gg's sign-in page in a new tab, and chat reloads when you come back.

## 1.0.5 (2026-10-05)

- Android: after Refresh or an update, the app always keeps the chat box clear of the navigation buttons, padding their standard height when it has nothing measured yet.

## 1.0.4 (2026-10-05)

- Android: the chat box no longer ends up under the navigation buttons after Refresh or an update, even on phones where Chrome never says how tall the buttons are. The app now compares the window to its size on a normal launch and pads the difference.

## 1.0.3 (2026-10-05)

- The "Now live" notice from 1.0.2 is gone again; the tab row is enough.

## 1.0.2 (2026-10-05)

- The live tabs no longer go stale after the phone changes networks (Wi-Fi to cellular, or back): a quiet connection is replaced and the list is fetched again, and a request that hangs is cut off and retried.
- A short "Now live" notice appears when a new embed shows up while the app is open.

## 1.0.1 (2026-10-04)

- Android: the chat box no longer ends up under the navigation buttons after a refresh.
- A Kick stream started just before locking the phone keeps playing as audio instead of switching to Kick's player.
- Holding a tab to add it to multi-view no longer also moves the sound.
- The "Restore your multi-view?" offer stops once you dismiss it or go back to one stream.
- AngelThump and Rumble no longer reload when the sound moves in multi-view.
- Streams kept hidden (warm, or loading ahead of a tap) are skipped by keyboard focus.
- YouTube offers Try again if its player doesn't load, and the live tabs reconnect after a server restart.
- Malformed requests no longer crash the server.

## 1.0.0 (2026-10-04)

- First public version.
- Every live embed from destiny.gg is a tab under the stream, updated the moment the list changes. Tap to switch, hold to add it to multi-view (up to four streams).
- Kick streams keep playing with the screen locked, with lock-screen controls, picture-in-picture and Chromecast.
- destiny.gg chat beside the stream in landscape and on desktop (resizable), or under it in portrait.
- Installs to the home screen and opens instantly, even offline. A bar offers each update when it's ready.
- ⋮ slides out refresh, picture-in-picture, multi-view, cast, reload chat and settings. Settings have a change log, sign in and sign out for chat, a share link, and buttons to suggest ideas or report problems.
