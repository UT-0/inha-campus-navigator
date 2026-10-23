/**
 * Downloads the licensed Wikimedia Commons photos listed in
 * data-raw/photos/commons.json into data-raw/photos/commons/<buildingId>.<ext>.
 *
 * Before each download the file's license is re-checked through the Commons
 * API (imageinfo + extmetadata); files whose license is not free (CC0,
 * CC BY, CC BY-SA, public domain) are skipped. Attribution in commons.json is
 * refreshed from the API.
 *
 *   npm run photos:fetch            download what is missing
 *   npm run photos:fetch -- --search
 *                                   also list candidate files from the Inha
 *                                   University category and a name search for
 *                                   every building (data-raw/photos/candidates.json),
 *                                   for a person to review; nothing is used
 *                                   automatically.
 *
 * Wikimedia asks for a descriptive User-Agent and few, sequential requests:
 * this script waits between requests and backs off on HTTP 429.
 *
 *   npm run photos:fetch -- --via-proxy
 *                                   for networks whose shared IP Wikimedia
 *                                   rate-limits (e.g. cloud containers): the
 *                                   image is downloaded once through the
 *                                   wsrv.nl image proxy (re-encoded as JPEG)
 *                                   and the license check uses the
 *                                   metadata recorded in commons.json from the
 *                                   file page. The site never hotlinks.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT =
  'inha-campus-navigator/1.0 (https://github.com/UT-0/inha-campus-navigator; photo script)';
const FREE_LICENSE = /^(cc0|cc[ -]by(-sa)?([ -]\d(\.\d)?)?|public domain|pd\b)/i;
const DELAY_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const VIA_PROXY = process.argv.includes('--via-proxy');

async function request(url, { binary = false, attempts = 5 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    // Through the proxy, Wikimedia's rate limiting shows up as a 404.
    const proxied = url.startsWith('https://wsrv.nl/');
    if (response.status === 429 || response.status >= 500 || (proxied && response.status === 404)) {
      const wait = Number(response.headers.get('retry-after')) * 1000 || attempt * 10_000;
      console.warn(`  HTTP ${response.status} (rate limited), waiting ${wait / 1000}s…`);
      await sleep(wait);
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    await sleep(DELAY_MS);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }
  throw new Error(`Gave up after repeated rate limiting: ${url}`);
}

const api = (params) =>
  request(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`, {
    attempts: VIA_PROXY ? 1 : 5,
  });

/** Strips HTML from extmetadata values ("<a href=…>Ifflies</a>" → "Ifflies"). */
const plain = (html) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .trim();

async function imageInfo(file) {
  const data = await api({
    action: 'query',
    titles: file,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
  });
  const info = data.query?.pages?.[0]?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  return {
    originalUrl: info.url.split('?')[0],
    sourceUrl: info.descriptionurl,
    width: info.width,
    height: info.height,
    author: plain(meta.Artist?.value) || null,
    license: plain(meta.LicenseShortName?.value) || null,
    licenseUrl: meta.LicenseUrl?.value ?? null,
  };
}

async function search(buildings) {
  const candidates = { category: [], byBuilding: {} };
  const members = await api({
    action: 'query',
    list: 'categorymembers',
    cmtitle: 'Category:Inha_University',
    cmtype: 'file',
    cmlimit: '200',
  });
  candidates.category = members.query.categorymembers.map((m) => m.title);
  for (const b of buildings) {
    const names = [b.ko, b.en, ...(b.aliases ?? [])].filter(Boolean);
    const found = new Set();
    for (const name of names.slice(0, 3)) {
      const result = await api({
        action: 'query',
        list: 'search',
        srnamespace: '6',
        srsearch: `${name} 인하`,
        srlimit: '10',
      });
      for (const hit of result.query.search) found.add(hit.title);
    }
    candidates.byBuilding[b.id] = [...found];
  }
  return candidates;
}

const manifestUrl = new URL('data-raw/photos/commons.json', ROOT);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const outDir = new URL('data-raw/photos/commons/', ROOT);
await mkdir(outDir, { recursive: true });

if (process.argv.includes('--search')) {
  const official = JSON.parse(
    await readFile(new URL('data-raw/official/buildings.json', ROOT), 'utf8'),
  );
  const candidates = await search(official.buildings);
  await writeFile(
    new URL('data-raw/photos/candidates.json', ROOT),
    `${JSON.stringify({ searched: new Date().toISOString().slice(0, 10), ...candidates }, null, 2)}\n`,
  );
  console.log('Wrote data-raw/photos/candidates.json — review before adding to commons.json.');
}

let failed = 0;
for (const photo of manifest.photos) {
  const ext = (photo.originalUrl.match(/\.(jpe?g|png|webp)$/i)?.[1] ?? 'jpg').toLowerCase();
  const target = new URL(`${photo.buildingId}.${ext}`, outDir);
  try {
    let info;
    try {
      info = await imageInfo(photo.file);
    } catch (error) {
      if (!VIA_PROXY) throw error;
      console.warn(`  API unavailable (${error.message}); using recorded metadata`);
      info = { ...photo };
    }
    if (!info) throw new Error('file not found on Commons');
    if (!FREE_LICENSE.test(info.license ?? '')) {
      console.warn(`✗ ${photo.file}: license "${info.license}" is not free — skipped`);
      continue;
    }
    if (info !== photo) {
      Object.assign(photo, info, { retrieved: new Date().toISOString().slice(0, 10) });
    }
    if (existsSync(target)) {
      console.log(`✓ ${photo.buildingId}: already downloaded`);
      continue;
    }
    const url = VIA_PROXY
      ? // The Commons URL is already percent-encoded and has no query string.
        `https://wsrv.nl/?url=${info.originalUrl.split('?')[0].replace(/^https:\/\//, '')}`
      : info.originalUrl;
    await writeFile(target, await request(url, { binary: true }));
    console.log(`✓ ${photo.buildingId}: ${photo.file} (${info.license}, ${info.author})`);
  } catch (error) {
    failed++;
    console.error(`✗ ${photo.buildingId}: ${error.message}`);
  }
}

await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(failed ? `${failed} photo(s) failed; run again later.` : 'All photos present.');
if (failed) process.exitCode = 1;
