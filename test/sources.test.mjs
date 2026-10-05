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
  assert.deepEqual(parseSource('kick.com/Destiny/videos/01a0f035-19d8-7dca-a86e-5d55f51a5672'), {
    type: 'kick-vod',
    id: 'Destiny/01a0f035-19d8-7dca-a86e-5d55f51a5672',
  });
  assert.deepEqual(parseSource('#kick-vod/Destiny/489b8b26-8a97-400f-9845-13d8f6fa6d1b'), {
    type: 'kick-vod',
    id: 'Destiny/489b8b26-8a97-400f-9845-13d8f6fa6d1b',
  });
  assert.equal(parseSource('kick.com/destiny/videos/abc-123'), null, 'a VOD needs a uuid');
  assert.deepEqual(parseSource('https://kick.com/destiny/clips/clip_01JHV4PM1Q1FW2BCGKR258FW37'), {
    type: 'kick-clip',
    id: 'clip_01JHV4PM1Q1FW2BCGKR258FW37',
  });
  assert.deepEqual(parseSource('https://player.kick.com/destiny?clip=clip_01JHV4PM1Q1FW2BCGKR258FW37'), {
    type: 'kick-clip',
    id: 'clip_01JHV4PM1Q1FW2BCGKR258FW37',
  });
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
  const list = parseHashList('#kick/a,twitch/b,kick/A,facebook/x,kick/c,kick/d,kick/e');
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

test('a hosted stream becomes a tab after Destiny', () => {
  const items = liveItems({
    destiny: [{ platform: 'kick', id: 'destiny', title: 'x' }],
    hosting: { platform: 'twitch', id: 'friend', name: 'Friend' },
    embeds: [
      { platform: 'twitch', id: 'friend', name: 'Friend' },
      { platform: 'kick', id: 'other', name: 'Other' },
    ],
  });
  assert.deepEqual(
    items.map((i) => `${key(i.src)}:${i.name}`),
    ['kick/destiny:Destiny (Kick)', 'twitch/friend:Host: Friend', 'kick/other:Other'],
  );
  assert.equal(items[1].hosting, true);
});
