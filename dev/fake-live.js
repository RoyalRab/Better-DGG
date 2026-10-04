'use strict';

// A stand-in for wss://live.destiny.gg so the app can run without the
// internet. Sends the same message shapes destiny.gg does, then changes the
// list over time so live updates can be tested:
//   0s  four live embeds plus three filler ones
//   2s  same list, only viewer counts change (the server should NOT push this)
//   6s  adds "newone" at the end
//   9s  drops "dariusirl" (the app should keep a dimmed tab if it's playing)
//
// Usage: node dev/fake-live.js [port]   (default 9996)
// Then:  LIVE_URL=ws://localhost:9996 PORT=8769 node server.js

const { WebSocketServer } = require('ws');

const port = Number(process.argv[2]) || 9996;
const wss = new WebSocketServer({ port });

const embed = (platform, id, name, viewers) => ({
  platform,
  id,
  count: 1,
  mediaItem: {
    identifier: { platform, mediaId: id },
    metadata: { displayName: name, title: `${name} stream`, live: true, viewers },
  },
});

const base = () => [
  embed('kick', 'drt0123', 'drt0123', 800 + Math.round(Math.random() * 50)),
  embed('kick', 'dariusirl', 'dariusirl', 700),
  embed('angelthump', 'yodime', 'Yodime', 300),
  embed('twitch', 'bingsamaa', 'bingsamaa', 90),
  embed('kick', 'aaa', 'aaa', 10),
  embed('kick', 'bbb', 'bbb', 10),
  embed('kick', 'ccc', 'ccc', 10),
  // Not live: the server must filter these out.
  {
    ...embed('youtube', 'dQw4w9WgXcQ', 'a video', null),
    mediaItem: {
      identifier: { platform: 'youtube', mediaId: 'dQw4w9WgXcQ' },
      metadata: { displayName: 'a video', live: false },
    },
  },
];

wss.on('connection', (ws, req) => {
  console.log('fake-live: connected, origin header =', JSON.stringify(req.headers.origin));
  const send = (type, data) => ws.send(JSON.stringify({ type, data }));
  send('dggApi:streamInfo', { streams: { kick: null, youtube: { live: false } } });
  send('dggApi:embeds', base());
  const timers = [
    setTimeout(() => send('dggApi:embeds', base()), 2000),
    setTimeout(() => send('dggApi:embeds', [...base(), embed('kick', 'newone', 'newone', 5)]), 6000),
    setTimeout(
      () =>
        send(
          'dggApi:embeds',
          base().filter((e) => e.id !== 'dariusirl'),
        ),
      9000,
    ),
  ];
  ws.on('close', () => timers.forEach(clearTimeout));
});

console.log(`fake-live: ws://localhost:${port}`);
