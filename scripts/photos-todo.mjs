/**
 * Writes PHOTOS-TODO.md: every building still without a real photo, in a
 * walking order that makes a photo tour efficient. Run after
 * `npm run data:build` (it reads src/data/campus.json).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { walkingOrder } from './lib/walking-order.mjs';

const ROOT = new URL('../', import.meta.url);
const campus = JSON.parse(await readFile(new URL('src/data/campus.json', ROOT), 'utf8'));
const byId = new Map(campus.buildings.map((b) => [b.id, b]));

const missing = campus.buildings.filter((b) => !b.photo?.src).map((b) => b.id);
const weak = campus.buildings.filter((b) => b.photo?.src && b.photo.width < 600);
const order = walkingOrder(campus, missing);
const total = order.reduce((sum, stop) => sum + (stop.walk ?? 0), 0);

const name = (b) =>
  `${b.number ? `${b.number}. ` : ''}${b.name.ko}${b.name.en !== b.name.ko ? ` (${b.name.en})` : ''}`;
const lines = [
  '# Photos to take',
  '',
  `Buildings without a photo: **${missing.length}** of ${campus.buildings.length}. ` +
    `The list is a walking route starting near the main gate (about ${Math.round(total / 10) * 10} m in total).`,
  '',
  'How to add a photo: save it as `public/photos/<id>.jpg` (or .png / .webp), then run',
  '`npm run photos:optimize && npm run data:build && npm run photos:todo`. Your photo is used',
  'instead of a Wikimedia Commons one and credited as "own work"; to credit someone else, add',
  '`{ "<id>": { "author": "…", "license": "CC BY 4.0" } }` to `data-raw/photos/own.json`.',
  '',
  'Tips: landscape (horizontal) photos work best; the panel shows them at about 16:7.',
  'Include the entrance if you can, so people recognise it when they arrive.',
  '',
  '| ✓ | # | Building | id | Walk from previous |',
  '|---|---|---|---|---|',
  ...order.map((stop, i) => {
    const b = byId.get(stop.id);
    const walk = i === 0 ? 'start' : stop.walk === null ? 'not connected' : `${stop.walk} m`;
    return `| ☐ | ${i + 1} | ${name(b)} | \`${b.id}\` | ${walk} |`;
  }),
  '',
];
if (weak.length) {
  lines.push(
    '## Replace (low resolution)',
    '',
    ...weak.map(
      (b) => `- ☐ ${name(b)} — \`${b.id}\`: current photo is only ${b.photo.width} px wide.`,
    ),
    '',
  );
}
lines.push(
  '## Photos already in place',
  '',
  ...campus.buildings
    .filter((b) => b.photo?.src)
    .map(
      (b) =>
        `- ${name(b)}: ${b.photo.kind === 'own' ? 'own work' : `Wikimedia Commons, ${b.photo.author}, ${b.photo.license}`}`,
    ),
  '',
);

await writeFile(new URL('PHOTOS-TODO.md', ROOT), lines.join('\n'));
console.log(`PHOTOS-TODO.md: ${missing.length} buildings without a photo.`);
