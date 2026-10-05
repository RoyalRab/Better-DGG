// The players inside a tile. YouTube and Twitch load through their JS APIs so
// they can be muted and report pauses; Kick plays in the app's own <video>
// with hls.js; everything else is a plain iframe.
//
// A player reports back through the tile: tile.onLoaded() when it's on
// screen, tile.onPlaying()/tile.onPaused(), tile.onSoundBlocked() when the
// browser refused sound, and tile.remount() to start over.

import { PLATFORM_NAMES } from './sources.js';
import { state, isCurrent, streamName } from './state.js';
import { isTouch, store, report, settings } from './util.js';

const scripts = {};
export function loadScript(src) {
  scripts[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => {
      delete scripts[src];
      reject(new Error('Could not load ' + src));
    };
    document.head.appendChild(s);
  });
  return scripts[src];
}

let ytReady;
function loadYouTubeApi() {
  ytReady ||= new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve();
    // The API loads a second script itself; if that never arrives, give up so
    // the tile offers Try again instead of staying black.
    const timer = setTimeout(() => {
      ytReady = null;
      reject(new Error('YouTube API timed out'));
    }, 15000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      if (prev) prev();
      resolve();
    };
    loadScript('https://www.youtube.com/iframe_api').catch((e) => {
      clearTimeout(timer);
      ytReady = null;
      reject(e);
    });
  });
  return ytReady;
}

const playerTitle = (src) => `${streamName(src)} (${PLATFORM_NAMES[src.type] || src.type})`;

export function frameUrl(src, muted) {
  const id = encodeURIComponent(src.id);
  const parent = encodeURIComponent(location.hostname);
  switch (src.type) {
    case 'twitch-clip':
      return `https://clips.twitch.tv/embed?clip=${id}&parent=${parent}&autoplay=true&muted=${muted}`;
    case 'youtube-live':
      return `https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&playsinline=1&mute=${muted ? 1 : 0}`;
    case 'kick':
      return `https://player.kick.com/${id}?autoplay=true&muted=${muted}`;
    case 'rumble':
      return `https://rumble.com/embed/${id}/`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${id}?autoplay=1&muted=${muted ? 1 : 0}`;
    case 'angelthump':
      return `https://player.angelthump.com/?channel=${id}`;
    default:
      return null;
  }
}
// Plain iframes whose URL can ask for muted playback; the others can't be muted from outside.
const FRAME_CAN_MUTE = new Set(['twitch-clip', 'youtube-live', 'kick', 'vimeo']);

// Players the app can turn the sound on for. The others (AngelThump, Rumble)
// handle sound themselves; reloading them for sound would join the stream a
// second time, so their own speaker button is used instead.
export const canControlSound = (src) =>
  ['youtube', 'twitch', 'twitch-vod'].includes(src.type) || FRAME_CAN_MUTE.has(src.type);

export function mountFrame(tile, muted) {
  const f = document.createElement('iframe');
  f.src = frameUrl(tile.src, muted);
  f.title = playerTitle(tile.src);
  f.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
  f.allowFullscreen = true;
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.addEventListener('load', () => tile.onLoaded());
  tile.body.appendChild(f);
  return {
    muted,
    play() {},
    // A plain iframe can only change sound by reloading with a different URL.
    // Players that can't be muted from outside are left alone either way:
    // reloading them would join the stream a second time.
    setMuted(m) {
      if (m === this.muted || !FRAME_CAN_MUTE.has(tile.src.type)) return;
      this.muted = m;
      f.src = frameUrl(tile.src, m);
    },
    // Players that start muted because of autoplay rules need a reload after a tap.
    unmute() {
      if (!FRAME_CAN_MUTE.has(tile.src.type)) return;
      this.muted = false;
      f.src = frameUrl(tile.src, false);
    },
    destroy() {
      f.remove();
    },
  };
}

export async function mountYouTube(tile, muted) {
  await loadYouTubeApi();
  const holder = document.createElement('div');
  holder.id = 'yt-' + Math.random().toString(36).slice(2);
  tile.body.appendChild(holder);
  const yt = new window.YT.Player(holder, {
    videoId: tile.src.id,
    playerVars: {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
      mute: muted ? 1 : 0,
      ...(tile.src.t ? { start: tile.src.t } : {}),
    },
    events: {
      onReady: () => tile.onLoaded(),
      onStateChange(e) {
        if (e.data === window.YT.PlayerState.PLAYING) tile.onPlaying();
        else if (e.data === window.YT.PlayerState.PAUSED) tile.onPaused();
      },
    },
  });
  return {
    play() {
      try {
        yt.playVideo();
      } catch {}
    },
    setMuted(m) {
      try {
        if (m) yt.mute();
        else {
          yt.unMute();
          yt.setVolume(100);
          yt.playVideo();
        }
      } catch {}
    },
    unmute() {
      this.setMuted(false);
    },
    destroy() {
      try {
        yt.destroy();
      } catch {}
      const el = document.getElementById(holder.id);
      if (el) el.remove();
    },
  };
}

// Twitch's player won't start with sound on its own inside a frame on a
// phone, and it doesn't fall back to muted: it sits on its play button. So
// on touch devices it's started muted (which phones allow), the sound is
// turned on once it plays, and if the browser refuses that it goes back to
// muted with the Tap for sound chip. A player that never starts (desktop,
// sound refused) gets the same treatment after a few seconds.
const TWITCH_START_TIMEOUT_MS = 4000;
const TWITCH_UNMUTE_GRACE_MS = 1500;
export async function mountTwitch(tile, muted) {
  await loadScript('https://player.twitch.tv/js/embed/v1.js');
  const holder = document.createElement('div');
  holder.id = 'tw-' + Math.random().toString(36).slice(2);
  tile.body.appendChild(holder);
  const what =
    tile.src.type === 'twitch-vod'
      ? { video: tile.src.id, ...(tile.src.t ? { time: `${tile.src.t}s` } : {}) }
      : { channel: tile.src.id };
  const Twitch = window.Twitch;
  const startMuted = muted || isTouch;
  const tw = new Twitch.Player(holder.id, {
    ...what,
    width: '100%',
    height: '100%',
    autoplay: true,
    muted: startMuted,
    parent: [location.hostname],
  });
  const frame = holder.querySelector('iframe');
  if (frame) {
    if (!frame.title) frame.title = playerTitle(tile.src);
    // Hand the page's autoplay permission to Twitch's frame.
    frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
  }
  let wantSound = !muted;
  let playing = false;
  let unmutedAt = 0;
  let gone = false;
  const safe = (fn) => {
    try {
      fn();
    } catch {}
  };
  // Muted and playing, with the chip to turn the sound on.
  function fallBackToMuted() {
    wantSound = false;
    safe(() => tw.setMuted(true));
    safe(() => tw.play());
    tile.onSoundBlocked();
  }
  tw.addEventListener(Twitch.Player.READY, () => {
    tile.onLoaded();
    setTimeout(() => {
      if (!gone && !playing && !startMuted) fallBackToMuted();
    }, TWITCH_START_TIMEOUT_MS);
  });
  tw.addEventListener(Twitch.Player.PLAYING, () => {
    const first = !playing;
    playing = true;
    tile.onPlaying();
    if (first && wantSound && startMuted) {
      unmutedAt = Date.now();
      safe(() => tw.setMuted(false));
      safe(() => tw.setVolume(1));
    }
  });
  tw.addEventListener(Twitch.Player.PAUSE, () => {
    // Paused right after turning the sound on: the browser refused it.
    if (unmutedAt && Date.now() - unmutedAt < TWITCH_UNMUTE_GRACE_MS) {
      unmutedAt = 0;
      fallBackToMuted();
      return;
    }
    tile.onPaused();
  });
  return {
    play() {
      safe(() => tw.play());
    },
    setMuted(m) {
      wantSound = !m;
      unmutedAt = 0; // a real tap: a pause now is the person's own
      safe(() => {
        tw.setMuted(m);
        if (!m) {
          tw.setVolume(1);
          tw.play();
        }
      });
    },
    unmute() {
      this.setMuted(false);
    },
    destroy() {
      gone = true;
      holder.remove();
    },
  };
}

// ---------- The app's own player (Kick) ----------
// Kick streams play in the app's own <video>, which keeps sound going when
// the phone locks, shows lock screen controls, and can be cast.

// Served by our server at a versioned path (see server.js); the page's meta tag has it.
export const HLS_JS = document.querySelector('meta[name="hls-js"]')?.content || 'vendor/hls.min.js';
// Start a bit below full quality so the picture appears sooner on mobile
// data, never fetch more pixels than the player shows, and keep little
// already-played video around.
// Stay near live. Kick's playlists are plain HLS with 2 s or 4 s segments
// (no low-latency parts; Kick's own player reads its EXT-X-PREFETCH tags,
// which hls.js can't), so the target is a fixed 5 s behind the newest
// segment rather than hls.js's three segments, which was 12 s on a 4 s
// stream. Every stall adds delay: hls.js eases the target out by a second
// per stall (up to a segment's worth), and when it's behind it plays up to
// 25% faster until it's back, jumping straight to live when it's more than
// 12 s behind.
const LIVE_CATCH_UP = { liveSyncDuration: 5, liveMaxLatencyDuration: 12, maxLiveSyncPlaybackRate: 1.25 };
const HLS_CONFIG = {
  ...LIVE_CATCH_UP,
  capLevelToPlayerSize: true,
  abrEwmaDefaultEstimate: 1_500_000,
  backBufferLength: 30,
};
export const OWN_PLAYER_TYPES = new Set(['kick']);
// Mobile data, as far as the browser says (Chrome on Android does; others don't).
export const onMobileData = () => {
  const c = navigator.connection;
  return !!c && (c.type === 'cellular' || c.saveData === true);
};
export const hasMse = () => !!(window.MediaSource || window.ManagedMediaSource);

const OWN_START_TIMEOUT_MS = 12000;
const BEHIND_SECONDS = 15;

// Chrome on Android pauses any video when the page goes to the background,
// but lets audio-only playback continue. Kick streams have no audio-only
// version, so this hls.js instance drops the video track before it reaches
// the browser, which then sees an audio-only stream.
export function makeAudioOnlyHls(config) {
  const Hls = window.Hls;
  const h = new Hls(config);
  const trigger = h.trigger.bind(h);
  // Forget that fragments had video, so hls.js doesn't wait for video
  // buffering that will never happen before loading the next one.
  const dropVideo = (data) => {
    for (const f of [data && data.frag, data && data.part]) {
      if (f && f.elementaryStreams && f.elementaryStreams.video) f.elementaryStreams.video = null;
    }
  };
  h.trigger = (event, data) => {
    if (event === Hls.Events.BUFFER_CODECS && data && data.video) {
      const rest = { ...data };
      delete rest.video;
      return Object.keys(rest).length ? trigger(event, rest) : false;
    }
    if (event === Hls.Events.BUFFER_APPENDING && data && data.type === 'video') {
      dropVideo(data);
      return false;
    }
    if (event === Hls.Events.FRAG_PARSED) dropVideo(data);
    return trigger(event, data);
  };
  return h;
}

export const ownStreamUrl = (src) =>
  new URL(`api/stream/${src.type}/${encodeURIComponent(src.id)}.m3u8`, location.href).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function mountOwn(tile, muted) {
  const url = ownStreamUrl(tile.src);
  // A press that turns into a scroll drops the tile while this is in flight.
  const token = tile.token;
  const cancelled = () => token !== tile.token;
  let check = await fetch(url, { cache: 'no-store' });
  // The relay answers 503 when Kick still lists the stream live but its
  // video is gone for the moment (a restart). That tends to pass within a
  // minute, and the site's own player couldn't play either, so wait a
  // little before falling back.
  for (let tries = 0; check.status === 503 && tries < 5; tries++) {
    tile.onWaiting?.();
    await sleep(6000);
    if (cancelled()) throw new Error('cancelled');
    check = await fetch(url, { cache: 'no-store' });
  }
  if (!check.ok) throw new Error('not playable: ' + check.status);
  if (cancelled()) throw new Error('cancelled');

  // Audio only: an <audio> element fed the audio-only copy of the stream
  // (no video track reaches the browser, so no video data is fetched),
  // behind a card with the stream's name. It keeps playing when the phone
  // locks without any switching.
  const audioOnly = !!settings.audioOnly;
  const v = document.createElement(audioOnly ? 'audio' : 'video');
  v.className = 'own-player';
  v.controls = true;
  v.autoplay = true;
  v.playsInline = true;
  v.muted = muted;
  v.setAttribute('playsinline', '');
  v.setAttribute('aria-label', playerTitle(tile.src));
  if (audioOnly) {
    const card = document.createElement('div');
    card.className = 'audio-only';
    const name = document.createElement('b');
    name.textContent = playerTitle(tile.src);
    const note = document.createElement('span');
    note.textContent = 'Audio only (settings)';
    card.append(name, note);
    tile.body.appendChild(card);
  } else {
    // Let the browser pop it out on its own when you leave the app, where supported.
    v.autoPictureInPicture = true;
    v.setAttribute('autopictureinpicture', '');
  }
  // Some streams are much louder than others: the volume is kept per stream.
  const volumeKey = `volume:${tile.src.type}/${tile.src.id}`;
  const savedVolume = store.get(volumeKey, null);
  if (typeof savedVolume === 'number' && savedVolume >= 0 && savedVolume <= 1) v.volume = savedVolume;
  v.addEventListener('volumechange', () => {
    if (!v.muted) store.set(volumeKey, Math.round(v.volume * 100) / 100);
  });
  tile.body.appendChild(v);

  // hls.js plays the stream through Media Source in the page. Chrome's
  // built-in HLS support can't play these playlists, so it's only the
  // fallback for browsers without Media Source (older iPhones).
  let hls = null;
  const stillMine = () => state.tiles.includes(tile) && (!tile.player || tile.player.video === v);
  let bg = null; // { audio, hls }: the audio-only copy while the page is hidden
  if (hasMse()) {
    await loadScript(HLS_JS);
    if (cancelled()) {
      v.remove();
      throw new Error('cancelled');
    }
    const Hls = window.Hls;
    if (!Hls || !Hls.isSupported()) {
      v.remove();
      throw new Error('no HLS support');
    }
    hls = audioOnly ? makeAudioOnlyHls(HLS_CONFIG) : new Hls(HLS_CONFIG);
    hls.on(Hls.Events.MANIFEST_PARSED, () => applyQuality());
    let recoveries = 0;
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal) return;
      if (recoveries++ >= 3) return giveUp();
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else setTimeout(() => hls && hls.loadSource(url), 2000);
    });
    hls.loadSource(url);
    hls.attachMedia(v);
  } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
    v.src = url;
  } else {
    v.remove();
    throw new Error('no HLS support');
  }

  // Quality: the picked ceiling from settings, lowered to 480p on mobile data
  // when the data saver is on. hls.js still picks the best level under it.
  function applyQuality() {
    if (!hls || !hls.levels || !hls.levels.length) return;
    let max = settings.kickQuality === 'auto' ? Infinity : Number(settings.kickQuality) || Infinity;
    if (settings.dataSaver && onMobileData()) max = Math.min(max, 480);
    if (!Number.isFinite(max)) {
      hls.autoLevelCapping = -1;
      return;
    }
    let cap = -1;
    hls.levels.forEach((l, i) => {
      if (l.height && l.height <= max && (cap < 0 || l.height >= hls.levels[cap].height)) cap = i;
    });
    // Nothing small enough: the lowest there is.
    if (cap < 0) cap = hls.levels.reduce((best, l, i) => (l.height < hls.levels[best].height ? i : best), 0);
    hls.autoLevelCapping = cap;
    if (hls.currentLevel > cap) hls.currentLevel = -1;
  }
  const conn = navigator.connection;
  const onConnection = () => applyQuality();
  conn?.addEventListener?.('change', onConnection);

  // If it hasn't started in a few seconds, go back to the site's own player.
  let started = false;
  let gaveUp = false;
  function giveUp() {
    if (started || gaveUp) return;
    // A hidden page (screen locked) can't start video; judge it once we're back.
    if (document.hidden || bg) {
      timer = setTimeout(giveUp, OWN_START_TIMEOUT_MS);
      return;
    }
    gaveUp = true;
    tile.ownFailed = true;
    report('own-player-failed', tile.src.id);
    if (stillMine()) tile.remount();
  }
  let timer = setTimeout(giveUp, OWN_START_TIMEOUT_MS);
  v.addEventListener('error', giveUp);
  v.addEventListener('playing', () => {
    started = true;
    clearTimeout(timer);
    tile.onPlaying();
  });
  v.addEventListener('pause', () => tile.onPaused());

  // When it has fallen behind live (after a pause or a stall), a chip says
  // how far and jumps back to live.
  const liveChip = document.createElement('button');
  liveChip.type = 'button';
  liveChip.className = 'live-chip';
  liveChip.hidden = true;
  tile.el.appendChild(liveChip);
  function liveEdge() {
    if (hls && hls.liveSyncPosition) return hls.liveSyncPosition;
    if (!hls && v.seekable.length) return v.seekable.end(v.seekable.length - 1) - 10;
    return null;
  }
  // Shown only when the stream has fallen behind; nothing covers it while live.
  function renderLiveChip() {
    const edge = liveEdge();
    const behind = edge == null || !started ? 0 : Math.round(edge - v.currentTime);
    liveChip.hidden = behind <= BEHIND_SECONDS;
    if (liveChip.hidden) return;
    liveChip.textContent = `${behind}s behind · Jump to live`;
    liveChip.setAttribute('aria-label', `${behind} seconds behind live. Jump to live`);
  }
  function jumpToLive() {
    const edge = liveEdge();
    if (edge != null) v.currentTime = edge;
    v.play().catch(() => {});
    renderLiveChip();
  }
  liveChip.addEventListener('click', jumpToLive);

  // Recover a frozen picture: playing but stuck for 10 s. First reload from
  // the live edge, then if that doesn't help, start a fresh player.
  let lastTime = -1;
  let lastProgressAt = Date.now();
  let stallStage = 0;
  let stallAt = 0; // where it froze; recovery counts once it plays past this
  const health = setInterval(() => {
    if (bg || document.hidden || !started) return;
    if (v.paused || v.currentTime !== lastTime) {
      lastTime = v.currentTime;
      lastProgressAt = Date.now();
      if (!v.paused && Math.abs(v.currentTime - stallAt) > 3) stallStage = 0;
    } else if (Date.now() - lastProgressAt > 10000) {
      lastProgressAt = Date.now();
      stallAt = v.currentTime;
      stallStage++;
      if (stallStage === 1 && hls) {
        hls.startLoad(-1);
        jumpToLive();
      } else if (stillMine()) {
        tile.remount();
        return;
      }
    }
    renderLiveChip();
  }, 2000);

  v.play().catch((err) => {
    // No sound allowed yet: play muted and offer a tap for sound.
    if (err && err.name === 'NotAllowedError' && !v.muted) {
      v.muted = true;
      tile.onSoundBlocked();
      v.play().catch(() => {});
    }
  });

  // While the page is hidden (screen locked, another app open), play the
  // sound from an audio-only copy of the stream, then go back to the video.
  let playingAtHide = false; // the stream was playing with sound when the page was hidden
  let userPausedAt = 0; // last pause from the user (lock screen or picture-in-picture controls)

  function startAudioCopy(retriesLeft) {
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    const h2 = makeAudioOnlyHls({ ...LIVE_CATCH_UP, backBufferLength: 30 });
    h2.on(window.Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal || !bg || bg.hls !== h2) return;
      // Rebuild it once before giving up, so a network blip doesn't end the sound.
      bg = null;
      h2.destroy();
      audio.pause();
      if (retriesLeft > 0 && document.hidden) startAudioCopy(retriesLeft - 1);
      else {
        report('background-audio-failed', `${tile.src.id} ${data.details || ''}`);
        resumeVideo();
      }
    });
    h2.loadSource(url);
    h2.attachMedia(audio);
    audio.play().catch(() => {});
    bg = { audio, hls: h2 };
  }
  function enterBackground() {
    if (audioOnly || bg || !hls || v.muted || !playingAtHide || !document.hidden) return;
    if (Date.now() - userPausedAt < 1500) return;
    if (!isCurrent(tile.src) || !state.tiles.includes(tile)) return;
    startAudioCopy(1);
    hls.stopLoad();
    v.pause();
  }
  function leaveBackground() {
    if (!bg) return;
    const { audio, hls: h2 } = bg;
    bg = null;
    h2.destroy();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    resumeVideo();
  }
  function resumeVideo() {
    if (hls) {
      hls.startLoad(-1);
      if (hls.liveSyncPosition) v.currentTime = hls.liveSyncPosition;
    }
    v.play().catch(() => {});
  }

  // Chrome on Android pauses the video when the page is hidden (screen
  // locked, another app open), and again when the screen locks while the
  // video is in picture-in-picture. Whenever that happens, carry on with the
  // audio-only copy. A video that keeps playing (in picture-in-picture, or on
  // desktop) is left alone.
  let hideTimer = null;
  function onVisibility() {
    clearTimeout(hideTimer);
    if (document.hidden) {
      // Playing, or still starting: a locked phone won't start the video, but
      // it will play the audio-only copy.
      playingAtHide = !v.muted && (!v.paused || !started);
      // Fallback in case the browser pauses without telling us right away.
      hideTimer = setTimeout(() => {
        if (v.paused || !started) enterBackground();
      }, 700);
    } else {
      leaveBackground();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);
  v.addEventListener('pause', () => {
    if (document.hidden && !bg) setTimeout(enterBackground, 0);
  });

  return {
    video: v,
    url,
    usesHls: () => !!hls,
    inBackground: () => !!bg,
    play() {
      if (bg) bg.audio.play().catch(() => {});
      else v.play().catch(() => {});
    },
    pause() {
      userPausedAt = Date.now();
      if (bg) bg.audio.pause();
      else v.pause();
    },
    setMuted(m) {
      v.muted = m;
      if (!m) v.play().catch(() => {});
    },
    unmute() {
      this.setMuted(false);
    },
    // Casting needs a plain URL on the element, so hand the stream over to it.
    castSource() {
      if (hls) {
        hls.destroy();
        hls = null;
      }
      v.src = url;
    },
    // Back online: pick the stream back up.
    reconnect() {
      if (hls) hls.startLoad(-1);
      v.play().catch(() => {});
    },
    audioOnly,
    applyQuality,
    // For dev/kick-player.mjs.
    levelsForTests: () => (hls ? hls.levels.map((l) => l.height) : []),
    cappingForTests: () => (hls ? hls.autoLevelCapping : null),
    destroy() {
      clearTimeout(timer);
      clearInterval(health);
      liveChip.remove();
      conn?.removeEventListener?.('change', onConnection);
      tile.body.querySelector('.audio-only')?.remove();
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(hideTimer);
      if (bg) {
        bg.hls.destroy();
        bg.audio.pause();
        bg = null;
      }
      if (hls) {
        hls.destroy();
        hls = null;
      }
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    },
  };
}
