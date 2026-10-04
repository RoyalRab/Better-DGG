# Agents

The project guide for AI agents (and anyone else) is **CLAUDE.md**: what the
code is, the decisions already made, how to test, and how deploys work. Read
it first; the name is just the convention one tool uses.

Quick start:

- `npm install`, then `npm start` and open http://localhost:8080.
- `npm run check` runs ESLint, Prettier and the unit tests. Run it before every push.
- `dev/fake-live.js` is a stand-in for destiny.gg's live feed, so the app can be
  worked on with no internet access. `dev/smoke.mjs` and `dev/screens.mjs` drive
  it in a browser (they need Playwright; see README → Development).
- Pushing to `main` deploys to Railway. No keys, logins or secrets are needed to
  contribute; the only credentials in the project are Railway's own, held by the
  owner.
- Every user-visible change: bump `version` in `package.json`, add a
  `CHANGELOG.md` entry, and update README.md (CLAUDE.md spells out the rules).
