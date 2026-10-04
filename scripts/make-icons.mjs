// Builds the app icons from destiny.gg's current icon with a REMIX tag on top.
// Runs during the Docker build. If the download fails, the icons already in
// public/icons are kept, so a build never breaks over this.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(root, 'public', 'icons');
const tag = path.join(root, 'icon-src', 'remix-tag.png');
const SOURCE = 'https://www.destiny.gg/';

async function fetchBaseIcon() {
  if (process.env.BASE_ICON) return fs.readFile(process.env.BASE_ICON);
  const page = await (await fetch(SOURCE, { signal: AbortSignal.timeout(15000) })).text();
  const manifestUrl = new URL(page.match(/<link rel="manifest" href="([^"]+)"/)[1], SOURCE);
  const manifest = await (await fetch(manifestUrl, { signal: AbortSignal.timeout(15000) })).json();
  const best = manifest.icons.slice().sort((a, b) => parseInt(b.sizes) - parseInt(a.sizes))[0];
  const res = await fetch(new URL(best.src, manifestUrl), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('icon ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

try {
  const base = await sharp(await fetchBaseIcon()).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const tagged = await sharp(base).composite([{ input: tag }]).png().toBuffer();
  const white = { r: 255, g: 255, b: 255, alpha: 1 };

  await sharp(tagged).toFile(path.join(out, 'icon-512.png'));
  await sharp(tagged).resize(192, 192).toFile(path.join(out, 'icon-192.png'));
  // iOS fills transparent areas with black, so flatten onto white.
  await sharp(tagged).flatten({ background: white }).resize(180, 180).toFile(path.join(out, 'apple-touch-icon.png'));
  // Android masks this one into its own shape, so keep everything well inside.
  const inner = await sharp(tagged).resize(380, 380).toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: white } })
    .composite([{ input: inner, left: 66, top: 66 }])
    .png()
    .toFile(path.join(out, 'maskable-512.png'));
  // Browser tab icon.
  await sharp(tagged).resize(64, 64).toFile(path.join(out, 'favicon-64.png'));
  console.log('icons: built from destiny.gg icon with REMIX tag');
} catch (err) {
  console.log('icons: kept existing icons (' + err.message + ')');
}
