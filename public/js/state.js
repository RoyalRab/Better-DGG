// What's on screen, shared between modules.

import { key } from './sources.js';

export const state = {
  tiles: [], // { src, el, body, player, token, wantPlaying, soundBlocked, ... }
  current: null, // the stream with sound (the only one in single view)
  addMode: false, // the next tab tap adds a stream to multi-view instead of switching
  tabItems: [], // the live list, as tabs
  startPending: false, // waiting for the live list to pick what to open
};

export const isCurrent = (src) => !!state.current && key(state.current) === key(src);

// Display names from the live list, remembered after a stream drops out of it.
export const knownNames = new Map();
const fallbackName = (src) => {
  if (src.type === 'kick-vod') return `${src.id.split('/')[0]} (VOD)`;
  if (src.type === 'kick-clip') return 'Kick clip';
  return src.id;
};
export const streamName = (src) => knownNames.get(key(src)) || fallbackName(src);
