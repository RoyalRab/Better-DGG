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
| Resizable chat width on desktop/ultrawide, chat on the left option | Fit different screens and tastes | M |
| Multi-view "focus" layout: one big stream with small ones beside it | Better than equal tiles for one main stream | M |
| Remember volume per stream | Some streams are much louder than others | S |
| Ended-stream screen that suggests the most-embedded live stream | No dead end when a stream ends | S |

## Polish

| Idea | Why | Effort |
| --- | --- | --- |
| Loading spinner on a tile while its player starts | Black boxes look broken | S |
| Menu as a bottom sheet on phones, with swipe down to close | Easier to reach one-handed | S |
| One-time hint: "Hold a tab to add it to multi-view" | Long-press is invisible until someone tells you | S |
| Favorite channels pinned to the front of the tab row (long-press menu: Favorite, Add to multi-view) | Find your regulars instantly | M |
| Keep the old stream on screen until the new one starts playing | Switching feels instant instead of flashing black | M |
| Drag to resize chat in landscape and on desktop | Choose between more video and more chat | M |
| Small latency/"LIVE" indicator on the app's own player | Know whether you're behind | S |
| "What's new" note in the menu after an update | People see what changed when the version bumps | S |

## Accessibility

| Idea | Why | Effort |
| --- | --- | --- |
| Larger invisible tap area around the short tabs (44 px target, same look) | Easier to hit without making the row taller | S |
| Visible keyboard focus, labels on every button, announce stream changes to screen readers | Usable with a keyboard or screen reader | S |
| Respect "reduce motion" | No smooth scrolling or animations for people who turn them off | S |

## Security

| Idea | Why | Effort |
| --- | --- | --- |
| Rate limit `/api/stream/kick/...` per visitor | Stops anyone using the server as a free proxy for Kick's API | S |
| Cap open live-update connections per visitor | One misbehaving client can't hog the server | S |
| Content-Security-Policy header allowing only the sites the app uses | Limits damage if anything ever got injected | M |

## Code health

| Idea | Why | Effort |
| --- | --- | --- |
| Split `public/app.js` (about 1,300 lines) into a few ES modules, still with no build step | Easier and cheaper to change | M |
| Unit tests with `node:test` for `parseSource`/`validate` and the server's list filtering and Kick relay | Catch regressions without a browser | S |
| ESLint + Prettier in CI | Consistent code, fewer silly bugs | S |
| Dependabot for `ws`, `sharp` and the pinned hls.js | Security fixes arrive as pull requests | S |
| CHANGELOG.md updated with each version bump | One place to see what changed and when | S |

## Maintenance

| Idea | Why | Effort |
| --- | --- | --- |
| Run `dev/smoke.mjs` in GitHub Actions on every push | Catch breakage before the user does | S |
| Custom domain | Easier to share and remember | S |
| Delete the `dgg-probe` Railway Function when it's no longer needed | Tidier project | S |
| Opt-in error reports (player failures, background audio failures) to the server log | Diagnose phone-only problems without screenshots | M |
