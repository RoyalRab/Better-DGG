# Ideas

The owner's backlog. Ideas from users arrive as GitHub issues labelled `idea` (Settings → Suggest an idea). Ways to make DGG Remix better, roughly from most to least useful. Effort: S is about an hour, M is half a day, L is a day or more.

## Mobile experience

| Idea | Why | Effort |
| --- | --- | --- |
| Audio-only mode toggle | Listen with the video off to save data and battery; reuses `makeAudioOnlyHls` | S |
| Data saver: cap Kick quality on cellular (`navigator.connection`, hls.js level cap) and a quality picker | Less data on mobile, sharper picture on Wi-Fi | M |
| Rotate to landscape goes fullscreen, with an optional see-through chat overlay | Watching sideways without wasting space | M |
| Kick low latency: read the `EXT-X-PREFETCH` segments Kick's playlists list (the one being written) through a custom hls.js loader, as Kick's own player does | Another 2 to 4 s closer to live | L |
| Push notification when Destiny goes live (Web Push; the server already sees `dggApi:streamInfo`) | Know when to open the app | L |

## Everywhere

| Idea | Why | Effort |
| --- | --- | --- |
| Destiny's latest VOD/videos (`dggApi:youtubeVods`, `dggApi:videos`) in the menu when he's offline | Something to watch when nothing's live | M |
| Preview thumbnails when holding or hovering a tab (the feed has `previewUrl`) | See what's on before switching | M |
| Kick VODs and clips (shared links to them are ignored today) | Watch what someone links without leaving the app | M |
| Multi-view "focus" layout: one big stream with small ones beside it | Better than equal tiles for one main stream | M |

## Maintenance

| Idea | Why | Effort |
| --- | --- | --- |
| Run `dev/smoke.mjs` in GitHub Actions on every push | Catch breakage before the user does | S |
| Custom domain | Easier to share and remember | S |
| Delete the `dgg-probe` Railway Function when it's no longer needed | Tidier project | S |
