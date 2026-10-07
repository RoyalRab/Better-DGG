# Changelog

What changed in each version of DGG Remix. The newest version is listed in the app's settings, with older ones folded underneath. Add an entry here with every version bump.

## 1.12.1 (2026-10-07)

- Glitchwave's scanlines now run over the stream as well as chat.

## 1.12.0 (2026-10-07)

- Themes now reach chat: every theme except Dark tints chat's background to match, and Glitchwave adds scanlines. Chat's text and emotes stay as destiny.gg draws them.

## 1.11.0 (2026-10-07)

- Nine more themes: destiny.gg (the site's own blue), Nord, Dracula, Catppuccin, Gruvbox, Tokyo Night, Cyberpunk, Vaporwave and Matrix.

## 1.10.0 (2026-10-07)

- Themes: Settings → Theme recolours the app. Dark (as before), Purple, Synthwave, Glitchwave (Blood Dragon neon), OLED black, Kick green, or Custom with your own background and accent colours. The phone's status bar follows the theme. Chat is destiny.gg's own page and keeps its look.

## 1.9.0 (2026-10-07)

- Everyone gets told how to install the app, whatever the browser: the bar at the top installs in one tap where the browser allows it and otherwise has a How button; ⋮ has an Install button; and Settings → Get the app gives the steps for your browser (Chrome, Samsung Internet, Firefox and Edge on Android, Safari and other browsers on iPhone and iPad, Chrome, Edge, Opera and Safari on a computer, and Firefox, which can't install), with every other browser folded underneath. Once the app is installed, the bar stays away.
- Settings → More from destiny.gg links to the rest of the site, as destiny.gg's own menu does: Subscribe, Donate, Merch, VODs, Events, Schedule, TTS queue, The Vault and the Wiki.
- On a computer, Settings → Chat account has Pop out chat, which opens chat in its own small window.

## 1.8.0 (2026-10-05)

- For whoever runs the server: it can now press a real button through a SwitchBot Bot whenever someone donates in chat (or subscribes, or gifts subs). Set up with a few variables on the server; see README → Development.

## 1.7.5 (2026-10-05)

- Fixes the blank white screen the installed app showed on Android after pressing Home and coming back. The app no longer tries to pop the stream out by itself when you leave: the sound carries on in the background as before, and pop-out is the picture-in-picture button in the ⋮ row.

## 1.7.4 (2026-10-05)

- Settings → Chat account now says to tick "Remember me" when signing in, since without it destiny.gg forgets you whenever the phone restarts Chrome in the background.

## 1.7.3 (2026-10-05)

- Fixes the blank screen that could sit on top of the app after pressing Home, until Back was pressed. When the browser accepts the app's own pop-out request, the video now keeps playing in the floating window instead of being stopped, and coming back to the app closes that window.

## 1.7.2 (2026-10-05)

- The "Latest from Destiny" list now sits at the bottom of settings, above the change log, instead of at the top.

## 1.7.1 (2026-10-05)

- Kick streams in the app's own player now ask to pop out into a floating window by themselves the moment you leave the app, before switching to sound only. Whether the browser allows that is up to the browser; the Display line in settings shows its answer.

## 1.7.0 (2026-10-05)

- YouTube videos that chatters embed now show up as tabs (with a small ▶), so you can watch them along with everyone, not just live streams.
- New address: mobile-dgg.com. The old one keeps working.

## 1.6.0 (2026-10-05)

- Notifications: a setting tells you when Destiny goes live, even when the app is closed. A tap opens the stream.
- The browser checks now run on GitHub for every change, not just the unit tests.

## 1.5.0 (2026-10-05)

- Stream previews: rest the mouse on a tab, or hold a tab on a phone, to see a picture of the stream first.
- Latest from Destiny: while nothing of his is live, settings list his newest YouTube videos and Kick VODs, playable in the app.
- Kick VODs and clips play in the app's own player, from a shared link or a destiny.gg link.
- Settings show the installed app's window size and button-bar inset (a "Display" line), to help pin down the padding problem on Android.

## 1.4.0 (2026-10-05)

- Landscape fullscreen for phones (settings): sideways, the stream fills the screen, chat sits see-through on the right with a button to hide it, and a tap on the stream or on the handle at the bottom brings the tabs up.
- Focus layout for multi-view (⋮ row): the stream with the sound is big and the others small.

## 1.3.1 (2026-10-05)

- The chat box no longer ends up under the Android buttons after an update, and there's no empty band above them either: the app now checks where the window ends instead of guessing.
- When a Kick stream drops for a moment (a restart on Kick's side), the app's own player waits up to half a minute for it instead of switching to Kick's player at once, and if it did switch, it comes back to the app's player on its own once the stream is there again.

## 1.3.0 (2026-10-05)

- Audio only: a setting plays Kick streams as sound only in the app's own player, for less data and battery.
- Kick quality: a setting caps Kick streams in the app's own player at 1080p, 720p, 480p or 360p, or leaves it on Auto.
- Data saver: on mobile data, Kick streams in the app's own player stay at 480p or below. On by default; turn it off in settings.

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
