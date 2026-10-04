// Stream sources. A source is { type, id } using destiny.gg's bigscreen
// platform names, e.g. { type: 'kick', id: 'destiny' } for #kick/destiny.
// Accepts those hash links and normal platform links. No DOM here, so the
// unit tests can load it in Node.

export const DEFAULT_SOURCE = { type: 'kick', id: 'destiny' };
export const MAX_TILES = 4;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const DIGITS = /^\d{1,20}$/;

export const PLATFORM_NAMES = {
  kick: 'Kick',
  'kick-vod': 'Kick VOD',
  twitch: 'Twitch',
  'twitch-vod': 'Twitch VOD',
  'twitch-clip': 'Twitch clip',
  youtube: 'YouTube',
  'youtube-live': 'YouTube live',
  rumble: 'Rumble',
  vimeo: 'Vimeo',
  angelthump: 'AngelThump',
  facebook: 'Facebook',
};

// Platforms this app can't play itself; picking one opens destiny.gg's bigscreen.
export const OPEN_ON_DGG = new Set(['kick-vod', 'facebook']);

export const key = (src) => `${src.type}/${src.id}`;

export function parseSource(raw) {
  let s = (raw || '').trim();
  if (!s) return null;
  s = s.replace(/^#/, '');

  const hash = s.match(/^([a-z-]+)\/(.+)$/i);
  if (hash && PLATFORM_NAMES[hash[1].toLowerCase()]) {
    const type = hash[1].toLowerCase();
    let id = hash[2];
    let t = null;
    if (type === 'rumble') {
      id = id.replace(/\/?(\?.*)?$/, '');
    } else {
      const m = id.match(/^(.*?)\?t=(\d+)s?$/);
      if (m) {
        id = m[1];
        t = Number(m[2]);
      }
    }
    return validate({ type, id, t });
  }

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  const t = Number(String(url.searchParams.get('t') || '').replace(/s$/, '')) || null;

  if (host === 'kick.com' || host === 'player.kick.com') {
    if (parts[1] === 'videos' && parts[2]) return validate({ type: 'kick-vod', id: `${parts[0]}/videos/${parts[2]}` });
    return parts[0] ? validate({ type: 'kick', id: parts[0] }) : null;
  }
  if (host === 'clips.twitch.tv') {
    return validate({ type: 'twitch-clip', id: url.searchParams.get('clip') || parts[0] || '' });
  }
  if (host === 'twitch.tv' || host === 'player.twitch.tv') {
    if (parts[0] === 'videos' && parts[1]) return validate({ type: 'twitch-vod', id: parts[1] });
    if (parts[1] === 'clip' && parts[2]) return validate({ type: 'twitch-clip', id: parts[2] });
    if (url.searchParams.get('video')) {
      return validate({ type: 'twitch-vod', id: url.searchParams.get('video').replace(/^v/, '') });
    }
    const id = url.searchParams.get('channel') || parts[0];
    return id ? validate({ type: 'twitch', id }) : null;
  }
  if (host === 'youtu.be') {
    return parts[0] ? validate({ type: 'youtube', id: parts[0], t }) : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v) return validate({ type: 'youtube', id: v, t });
    if (['live', 'embed', 'shorts', 'v'].includes(parts[0]) && parts[1]) {
      if (parts[1] === 'live_stream' && url.searchParams.get('channel')) {
        return validate({ type: 'youtube-live', id: url.searchParams.get('channel') });
      }
      return validate({ type: 'youtube', id: parts[1], t });
    }
    return null;
  }
  if (host === 'rumble.com' && parts[0] === 'embed' && parts[1]) {
    return validate({ type: 'rumble', id: parts[1] });
  }
  if ((host === 'vimeo.com' || host === 'player.vimeo.com') && parts.length) {
    return validate({ type: 'vimeo', id: parts[parts.length - 1] });
  }
  if (host === 'angelthump.com' && parts[0]) {
    return validate({ type: 'angelthump', id: parts[0] });
  }
  return null;
}

export function validate(src) {
  const out = { type: src.type, id: src.id };
  if (src.t && (src.type === 'youtube' || src.type === 'twitch-vod')) out.t = src.t;
  switch (src.type) {
    case 'youtube':
      return YT_ID.test(src.id) ? out : null;
    case 'kick':
    case 'twitch':
    case 'angelthump':
      if (!NAME.test(src.id)) return null;
      out.id = src.id.toLowerCase();
      return out;
    case 'twitch-vod':
    case 'vimeo':
      return DIGITS.test(src.id) ? out : null;
    case 'kick-vod':
      return /^[\w-]{1,64}\/(videos\/)?[\w-]{1,64}$/.test(src.id) ? out : null;
    default:
      return NAME.test(src.id) ? out : null;
  }
}

// The hash lists what's on screen, e.g. #kick/destiny or #kick/a,twitch/b for multi-view.
export function parseHashList(hash) {
  const list = [];
  for (const part of hash.replace(/^#/, '').split(',')) {
    const src = parseSource(part);
    if (src && !OPEN_ON_DGG.has(src.type) && !list.some((s) => key(s) === key(src))) list.push(src);
  }
  return list.slice(0, MAX_TILES);
}

// Turns the server's live list ({ destiny, embeds }) into tabs: Destiny's own
// streams first, then everything embedded, without duplicates.
export function liveItems(data) {
  const items = [];
  for (const d of (data && data.destiny) || []) {
    let src = null;
    if (d.platform === 'kick') src = { type: 'kick', id: 'destiny' };
    else if (d.platform === 'youtube' && d.id) src = parseSource(`youtube/${d.id}`);
    else if (d.platform === 'rumble' && d.id) src = parseSource(`rumble/${d.id}`);
    if (src) {
      items.push({ src, destiny: true, name: `Destiny (${PLATFORM_NAMES[d.platform] || d.platform})`, title: d.title });
    }
  }
  for (const e of (data && data.embeds) || []) {
    const src = parseSource(`${e.platform}/${e.id}`);
    if (!src || items.some((i) => key(i.src) === key(src))) continue;
    items.push({ src, name: e.name || src.id, title: e.title });
  }
  return items;
}
