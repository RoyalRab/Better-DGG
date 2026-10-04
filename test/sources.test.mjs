// Stream link parsing and the live list, from public/js/sources.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSource, validate, parseHashList, liveItems, key } from '../public/js/sources.js';

test('parses destiny.gg hash links', () => {
  assert.deepEqual(parseSource('#kick/Destiny'), { type: 'kick', id: 'destiny' });
  assert.deepEqual(parseSource('twitch/SomeOne'), { type: 'twitch', id: 'someone' });
  assert.deepEqual(parseSource('youtube/dQw4w9WgXcQ?t=42'), { type: 'youtube', id: 'dQw4w9WgXcQ', t: 42 });
  assert.deepEqual(parseSource('rumble/v4abcd/?pub=x'), { type: 'rumble', id: 'v4abcd' });
  assert.deepEqual(parseSource('angelthump/yodime'), { type: 'angelthump', id: 'yodime' });
});

test('parses platform links', () => {
  assert.deepEqual(parseSource('https://kick.com/destiny'), { type: 'kick', id: 'destiny' });
  assert.deepEqual(parseSource('kick.com/destiny/videos/abc-123'), { type: 'kick-vod', id: 'destiny/videos/abc-123' });
  assert.deepEqual(parseSource('https://www.twitch.tv/videos/123456'), { type: 'twitch-vod', id: '123456' });
  assert.deepEqual(parseSource('https://clips.twitch.tv/FunnyClip'), { type: 'twitch-clip', id: 'FunnyClip' });
  assert.deepEqual(parseSource('https://youtu.be/dQw4w9WgXcQ?t=10s'), { type: 'youtube', id: 'dQw4w9WgXcQ', t: 10 });
  assert.deepEqual(parseSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { type: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseSource('https://youtube.com/live/dQw4w9WgXcQ'), { type: 'youtube', id: 'dQw4w9WgXcQ' });
  assert.deepEqual(parseSource('https://m.youtube.com/embed/live_stream?channel=UC123'), {
    type: 'youtube-live',
    id: 'UC123',
  });
  assert.deepEqual(parseSource('https://player.vimeo.com/video/76979871'), { type: 'vimeo', id: '76979871' });
});

test('rejects junk', () => {
  assert.equal(parseSource(''), null);
  assert.equal(parseSource('   '), null);
  assert.equal(parseSource('https://example.com/whatever'), null);
  assert.equal(parseSource('youtube/short'), null);
  assert.equal(parseSource('kick/has spaces'), null);
  assert.equal(parseSource('kick/' + 'a'.repeat(65)), null);
  assert.equal(parseSource('twitch-vod/abc'), null);
  assert.equal(validate({ type: 'kick', id: '<script>' }), null);
});

test('hash lists keep up to four unique playable streams', () => {
  const list = parseHashList('#kick/a,twitch/b,kick/A,kick-vod/x/videos/y,kick/c,kick/d,kick/e');
  assert.deepEqual(list.map(key), ['kick/a', 'twitch/b', 'kick/c', 'kick/d']);
  assert.deepEqual(parseHashList(''), []);
});

test('live list: Destiny first, no duplicates, names fall back to ids', () => {
  const items = liveItems({
    destiny: [{ platform: 'kick', id: 'destiny', title: 'Live' }],
    embeds: [
      { platform: 'kick', id: 'destiny', name: 'Destiny' },
      { platform: 'twitch', id: 'someone', name: 'Someone', title: 't' },
      { platform: 'kick', id: 'noname' },
      { platform: 'myspace', id: 'nope' },
    ],
  });
  assert.deepEqual(
    items.map((i) => [key(i.src), i.name, !!i.destiny]),
    [
      ['kick/destiny', 'Destiny (Kick)', true],
      ['twitch/someone', 'Someone', false],
      ['kick/noname', 'noname', false],
    ],
  );
  assert.deepEqual(liveItems(null), []);
});
