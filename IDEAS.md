# Ideas

Ways to make DGG Remix better, roughly from most to least useful. Effort: S is about an hour, M is half a day, L is a day or more.

## Mobile experience

| Idea | Why | Effort |
| --- | --- | --- |
| Swipe left/right on the player to go to the next/previous live embed | Switching without reaching for the tab row | S |
| Lock screen and earbud next/previous buttons switch embeds (Media Session `nexttrack`/`previoustrack`) | Change streams while listening with the screen off | S |
| Sleep timer (stop after 15/30/60 min) | Falling asleep listening; saves battery and data | S |
| Audio-only mode toggle | Listen with the video off to save data and battery; reuses `makeAudioOnlyHls` | S |
| Data saver: cap Kick quality on cellular (`navigator.connection`, hls.js level cap) and a quality picker | Less data on mobile, sharper picture on Wi-Fi | M |
| Rotate to landscape goes fullscreen, with an optional see-through chat overlay | Watching sideways without wasting space | M |
| Home screen shortcuts (manifest `shortcuts`): "Destiny's stream", "Multi-view" | Long-press the app icon to jump straight in | S |
| Share target (manifest `share_target`): share a Kick/YouTube/Twitch link to DGG Remix to open it | Open links from other apps without copy-paste | S |
| Haptic tap on long-press add (`navigator.vibrate`) | Confirms the stream was added | S |
| Push notification when Destiny goes live (Web Push; the server already sees `dggApi:streamInfo`) | Know when to open the app | L |

## Everywhere

| Idea | Why | Effort |
| --- | --- | --- |
| Hide embeds that DGG mods banned (`dggApi:bannedEmbeds` is on the same feed) | Match the bigscreen's rules | S |
| Show the hosted stream (`dggApi:hosting`) as a tab | Same as the bigscreen's host pill | S |
| Destiny's latest VOD/videos (`dggApi:youtubeVods`, `dggApi:videos`) in the menu when he's offline | Something to watch when nothing's live | M |
| Preview thumbnails when holding or hovering a tab (the feed has `previewUrl`) | See what's on before switching | M |
| Kick VODs in the app's own player (currently opens destiny.gg) | Fewer trips out of the app | M |
| Desktop keyboard shortcuts: 1–9 switch, M multi-view, C chat, F fullscreen, P picture-in-picture | Faster on desktop | S |
| Option to put chat on the left | Fit different tastes and setups | S |
| Multi-view "focus" layout: one big stream with small ones beside it | Better than equal tiles for one main stream | M |
| Remember volume per stream | Some streams are much louder than others | S |
| Ended-stream screen that suggests the most-embedded live stream | No dead end when a stream ends | S |

## Polish

| Idea | Why | Effort |
| --- | --- | --- |
| Favorite channels pinned to the front of the tab row | Find your regulars instantly (skipped for now; needs a home that doesn't change what holding a tab does) | M |

## Maintenance

| Idea | Why | Effort |
| --- | --- | --- |
| Run `dev/smoke.mjs` in GitHub Actions on every push | Catch breakage before the user does | S |
| Custom domain | Easier to share and remember | S |
| Delete the `dgg-probe` Railway Function when it's no longer needed | Tidier project | S |
| Opt-in error reports (player failures, background audio failures) to the server log | Diagnose phone-only problems without screenshots | M |
