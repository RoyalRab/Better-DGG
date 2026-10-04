# Changelog

What changed in each version of DGG Remix. The newest version is listed in the app's settings, with older ones folded underneath. Add an entry here with every version bump.

## 1.6.0 (2026-10-04)

- New address: https://dggremix.up.railway.app (the old better-dgg address no longer works; reinstall the app from the new one).
- Loading placeholders: a spinner in the player while the app picks a stream, faint tabs until the live list arrives, and "Loading chat…" until chat appears.

## 1.5.0 (2026-10-04)

- ⋮ now slides a row of icons over the tab row (refresh, picture-in-picture, multi-view, cast, reload chat, settings) instead of opening a long menu; ✕ puts them away.
- Settings close instantly.

## 1.4.0 (2026-10-04)

- A Kick stream you switch away from keeps running hidden and muted for a minute, so switching back to it is instant.
- The menu's buttons have icons.
- Android: the page now stays above the navigation buttons in the installed app, so the chat box isn't hidden under them.

## 1.3.1 (2026-10-04)

- The chat box is no longer hidden behind Android's navigation buttons in the installed app.
- Kick streams in the app's own player no longer drift further and further behind live: after a stall they play slightly faster until caught up, and jump to live if they fall far behind.

## 1.3.0 (2026-10-04)

- Streams start loading the moment you touch a tab, before you lift your finger.
- AngelThump and Rumble no longer reload (and rejoin the stream) for Tap for sound; use the player's own speaker button instead.

## 1.2.0 (2026-10-04)

- What's new: the menu lists what changed in each version, and a bar mentions it once after an update.
- Switching streams keeps the old one on screen until the new one starts, instead of flashing black.
- A loading spinner shows while a stream starts.
- Kick streams in the app's own player show LIVE, or how far behind they are with a Jump to live button.
- On phones the menu is a bottom sheet you can swipe down to close.
- Drag the line between the stream and chat to resize chat in landscape and on desktop (double-click resets it).
- A one-time tip explains that holding a tab adds it to multi-view.
- Easier to tap tabs, visible keyboard focus, labels on every button, stream changes announced to screen readers, and less motion when reduced motion is on.
- Security: a Content-Security-Policy, and limits so no one can use the server as a free proxy for Kick or hog live connections.

## 1.1.1 (2026-10-04)

- Bigger REMIX tag on the app icon, readable on the home screen.

## 1.1.0 (2026-10-04)

- The app opens instantly from the phone's cache, even on bad signal, and shows an Update ready bar when a new version has downloaded.
- Offline banner, and streams pick back up when the connection returns.
- A frozen Kick stream recovers on its own, and Jump to live catches up after a pause.
- Offers to restore your last multi-view.
- Kick starts at a lower quality and sharpens as the connection allows; chat loads after the stream starts.
- Smaller, compressed downloads, and smoother deploys.

## 1.0.0 (2026-10-04)

- First public version: live embed tabs from destiny.gg, Kick audio with the screen locked, multi-view, picture-in-picture, cast help, autoplay with sound, and an installable app.
