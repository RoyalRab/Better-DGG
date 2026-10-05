#!/bin/sh
# Builds a short VP9/Opus HLS stream (headless Chromium has no H.264 or AAC)
# in dev-out/hls for dev/kick-player.mjs. Needs ffmpeg.
set -e
OUT="${1:-dev-out/hls}"
mkdir -p "$OUT"
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i testsrc=size=320x180:rate=25 -f lavfi -i sine=frequency=440 -t 12 \
  -c:v libvpx-vp9 -deadline realtime -b:v 300k -c:a libopus \
  -f hls -hls_segment_type fmp4 -hls_time 2 -hls_playlist_type vod \
  -master_pl_name master.m3u8 "$OUT/media.m3u8"
# ffmpeg leaves the codecs out of the master; hls.js wants them.
sed -i 's/^#EXT-X-STREAM-INF:\(.*\)$/#EXT-X-STREAM-INF:\1,CODECS="vp09.00.10.08,opus"/' "$OUT/master.m3u8"
cat "$OUT/master.m3u8"
