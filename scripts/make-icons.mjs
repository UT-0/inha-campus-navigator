/**
 * Renders the app icons for the web app manifest from public/favicon.svg:
 * 192 and 512 px icons, a 512 px "maskable" icon with safe padding (Android
 * crops it to a circle or squircle) and the 180 px Apple touch icon.
 * Run once after changing the logo: `node scripts/make-icons.mjs`.
 */
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('public/icons/', ROOT);
await mkdir(OUT, { recursive: true });
const svg = await readFile(new URL('public/favicon.svg', ROOT));

const render = (size) => sharp(svg, { density: Math.ceil((size / 64) * 72) }).resize(size, size);

await render(192).png().toFile(new URL('icon-192.png', OUT).pathname);
await render(512).png().toFile(new URL('icon-512.png', OUT).pathname);
await render(180).png().toFile(new URL('apple-touch-icon.png', OUT).pathname);

// Maskable: the logo at 80% on a full-bleed background of the same navy.
const inner = await render(410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0b2a5b' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(new URL('maskable-512.png', OUT).pathname);

console.log('Icons written to public/icons/');
