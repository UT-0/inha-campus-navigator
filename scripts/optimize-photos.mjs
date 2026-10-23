/**
 * Turns building photos into web-ready WebP files and writes the photo
 * manifest the data build reads.
 *
 * Sources, in order of preference for each building:
 *   1. Your own photo: public/photos/<buildingId>.jpg / .jpeg / .png / .webp
 *      (attribution "Photo: own work"; optional details in
 *      data-raw/photos/own.json, e.g. { "b-2": { "author": "…", "date": "…" } })
 *   2. A Wikimedia Commons photo downloaded by fetch-photos.mjs into
 *      data-raw/photos/commons/<buildingId>.<ext>
 *
 * Output: public/photos/web/<buildingId>.webp (max 1200 px wide) and
 * public/photos/web/<buildingId>-400.webp (thumbnail), plus
 * data-raw/photos/manifest.json. Run `npm run data:build` afterwards
 * (`npm run photos` does fetch → optimize → build).
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const ROOT = new URL('../', import.meta.url);
const PUBLIC = new URL('public/photos/', ROOT);
const OUT = new URL('public/photos/web/', ROOT);
const COMMONS = new URL('data-raw/photos/commons/', ROOT);
const SIZES = [
  { suffix: '', width: 1200, quality: 78 },
  { suffix: '-400', width: 400, quality: 72 },
];
const SOURCE = /^(b-[a-z0-9-]+)\.(jpe?g|png|webp)$/i;

const readJson = async (url, fallback) =>
  existsSync(url) ? JSON.parse(await readFile(url, 'utf8')) : fallback;

await mkdir(OUT, { recursive: true });
const commons = await readJson(new URL('data-raw/photos/commons.json', ROOT), { photos: [] });
const own = await readJson(new URL('data-raw/photos/own.json', ROOT), {});
const commonsById = new Map(commons.photos.map((p) => [p.buildingId, p]));

/** Source files per building: your own photos win over Commons ones. */
const sources = new Map();
for (const [dir, kind] of [
  [COMMONS, 'commons'],
  [PUBLIC, 'own'],
]) {
  if (!existsSync(dir)) continue;
  for (const name of await readdir(dir)) {
    const match = SOURCE.exec(name);
    if (match) sources.set(match[1], { kind, url: new URL(name, dir) });
  }
}

const manifest = {};
for (const [id, source] of [...sources.entries()].sort()) {
  const input = await readFile(source.url);
  for (const size of SIZES) {
    await sharp(input)
      .rotate() // respect EXIF orientation
      .resize({ width: size.width, withoutEnlargement: true })
      .webp({ quality: size.quality })
      .toFile(new URL(`${id}${size.suffix}.webp`, OUT).pathname);
  }
  const meta = await sharp(new URL(`${id}.webp`, OUT).pathname).metadata();
  if (source.kind === 'own') {
    manifest[id] = {
      src: `photos/web/${id}.webp`,
      thumb: `photos/web/${id}-400.webp`,
      width: meta.width,
      height: meta.height,
      author: own[id]?.author ?? 'own work',
      license: own[id]?.license ?? null,
      sourceUrl: null,
      kind: 'own',
    };
  } else {
    const c = commonsById.get(id);
    if (!c) {
      console.warn(`✗ ${id}: Commons file without an entry in commons.json — skipped`);
      continue;
    }
    manifest[id] = {
      src: `photos/web/${id}.webp`,
      thumb: `photos/web/${id}-400.webp`,
      width: meta.width,
      height: meta.height,
      author: c.author,
      license: c.license,
      licenseUrl: c.licenseUrl,
      sourceUrl: c.sourceUrl,
      retrieved: c.retrieved,
      kind: 'commons',
      ...(c.note ? { note: c.note } : {}),
    };
  }
  console.log(`✓ ${id} (${source.kind}) → ${meta.width}×${meta.height}`);
}

await writeFile(
  new URL('data-raw/photos/manifest.json', ROOT),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`${Object.keys(manifest).length} photo(s) in data-raw/photos/manifest.json`);
