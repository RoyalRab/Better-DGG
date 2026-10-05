# Ideas

The owner's backlog. Ideas from users arrive as GitHub issues labelled `idea` (Settings → Suggest an idea). Ways to make DGG Remix better, roughly from most to least useful. Effort: S is about an hour, M is half a day, L is a day or more.

## Mobile experience

| Idea | Why | Effort |
| --- | --- | --- |
| Kick low latency: read the `EXT-X-PREFETCH` segments Kick's playlists list (the one being written) through a custom hls.js loader, as Kick's own player does | Another 2 to 4 s closer to live | L |
| Push notification when Destiny goes live (Web Push; the server already sees `dggApi:streamInfo`) | Know when to open the app | L |

## Everywhere

| Idea | Why | Effort |
| --- | --- | --- |

## Maintenance

| Idea | Why | Effort |
| --- | --- | --- |
| Run `dev/smoke.mjs` in GitHub Actions on every push | Catch breakage before the user does | S |
| Custom domain | Easier to share and remember | S |
| Delete the `dgg-probe` Railway Function when it's no longer needed | Tidier project | S |
