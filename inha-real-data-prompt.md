# Task: Convert the Campus Navigator from sample data to the REAL Inha University campus

## 0. Read this first

This repository already contains a working Campus Navigator web app (Vite + vanilla JS + SVG) built from `campus-navigator-prompt.md`, currently using **placeholder data**. Your job now is to replace the placeholder campus with the **real Inha University main campus** (인하대학교 용현캠퍼스, 100 Inha-ro, Michuhol-gu, Incheon), as completely and accurately as possible, and to add the features listed in section 7.

Before writing any code, read the existing code, `campus-navigator-prompt.md`, the README, and the current data files, so you understand the current architecture. Keep the architecture: data in JSON, logic separate, everything still works as a static site.

### The single most important rule: never invent facts

This app will be used by real students. **Wrong information is worse than missing information.**
- Every factual field (building name, number, department, floor contents, facility, opening hours, room) must come from a source you actually retrieved, and you must record that source.
- If you cannot find or confirm something, leave it empty and mark it `"status": "unknown"`. The UI then shows a neutral "Not yet verified" note. **Do not guess**, do not fill gaps with "typical university" assumptions, and do not write descriptions that imply facts you didn't find.
- Do not confuse Inha University with **Inha Technical College (인하공업전문대학)**, which may be located right next to the campus. Exclude its buildings unless I say otherwise, and check carefully which buildings belong to which institution.
- When sources disagree, prefer the most official and most recent one, and log the conflict in the verification report (section 9).

---

## 1. Check your network access before starting

This work depends on fetching real data. First, test whether you can reach these hosts:
- `overpass-api.de` (OpenStreetMap Overpass API) and `www.openstreetmap.org`
- `www.inha.ac.kr` and other `*.inha.ac.kr` subdomains (official university site, department pages)
- `commons.wikimedia.org`, `upload.wikimedia.org`, `ko.wikipedia.org`, `en.wikipedia.org`
- `registry.npmjs.org`

If any host is blocked, **stop and tell me exactly which ones**, so I can add them to the cloud environment's allowed network domains. Do not continue with made-up data as a workaround.

---

## 2. Sources and how to use each

| Data | Primary source | Notes |
|---|---|---|
| Building footprints, exact positions, shapes | OpenStreetMap (Overpass API) | Real geometry in latitude/longitude. Use this as the base for map accuracy. |
| Walkable paths, stairs, roads, gates, entrances | OpenStreetMap (`highway=footway/path/steps/pedestrian/service/residential`, `entrance=*`, `barrier=gate`) | Becomes the routing graph. |
| Campus boundary, green areas, sports fields, parking | OpenStreetMap (`amenity=university`, `leisure=*`, `landuse=*`, `amenity=parking`) | Map background layers. |
| Point amenities (toilets, ATM, vending machines, cafés, convenience stores, drinking water, bicycle parking, benches, AEDs) | OpenStreetMap amenity nodes inside the campus boundary | Only where actually mapped. |
| Official building names (Korean + English), building numbers (호관), departments, offices, facilities, opening hours | Official Inha website (`inha.ac.kr`: campus map / 캠퍼스맵, directions / 찾아오시는 길, each college and department page, library site, dormitory site, student services, cafeteria/학생식당 pages) | Search the site's own pages. The official building number and name override OSM names. |
| Transport (bus stops, subway station, shuttle) | Official "directions" page + OSM `highway=bus_stop`, `railway=station` | Include stops/stations just outside the gates. |
| Photos | Wikimedia Commons (properly licensed) or photos I add myself | See section 5. Never scrape photos from the Inha site, news sites, blogs, or portals. |
| Wi-Fi, printers, restrooms per floor, lounges, lockers | Official pages where available (e.g., IT/정보통신처 pages for Wi-Fi, library pages for printers) | Usually incomplete online. Fill what is sourced; mark the rest `unknown` for me to verify on campus. |

Write all data-fetching as **reproducible scripts** in `scripts/` (Node.js), so the data can be regenerated later:
- `scripts/fetch-osm.mjs` → saves raw Overpass responses to `data-raw/osm/*.json`
- `scripts/build-campus.mjs` → converts raw data + official info into the app's `src/data/*.json`
- `scripts/fetch-photos.mjs` → downloads licensed photos and records attribution
- `scripts/optimize-photos.mjs` → resizes photos to WebP
- `scripts/validate-data.mjs` → runs all data checks (section 9); add it as `npm run validate`

Commit the raw source snapshots in `data-raw/`, with the date fetched, so results are traceable.

For official web pages, save the URL and retrieval date for every fact you take from them in `data-raw/official-sources.json`. Write descriptions in your **own words**; do not copy paragraphs from the website.

---

## 3. Map geometry: make it accurate

1. Find the Inha University campus boundary in OSM (the `amenity=university` area named 인하대학교 / Inha University). Fetch everything inside it plus a margin of about 150 m (for gates, nearby bus stops, the subway station entrance, surrounding roads).
2. **Projection:** convert latitude/longitude to flat map coordinates in **meters** with a local equirectangular projection centered on the campus (x = east, y = south, so SVG's y-axis works). Set `metersPerUnit: 1`. Store the projection center in `meta` so the conversion can be reversed (needed for GPS, section 7).
3. Keep the map **north-up** and add a compass. Set the SVG `viewBox` to the campus bounds plus margin.
4. Use real OSM building polygons for footprints. Buildings composed of multiple OSM parts become one app building with several polygons where appropriate (match by official building number).
5. Map layers, back to front: surrounding area (muted), campus ground, green areas and trees, sports fields and courts, parking, roads (wider, labeled), footpaths, stairs (drawn with a distinct dashed or stepped style), buildings, amenity icons, labels, route.
6. Simplify polygons and lines lightly (for example Douglas–Peucker with about 0.5 m tolerance) so the SVG stays fast, but keep shapes recognizable.
7. **Attribution is required:** OSM data is licensed under ODbL, so show "© OpenStreetMap contributors" on the map (small, bottom corner, linking to openstreetmap.org/copyright), and also mention it in the README and an "About / Data sources" panel.

---

## 4. Routing graph from real paths

1. Build nodes and edges from OSM ways tagged as walkable (`footway`, `path`, `pedestrian`, `steps`, `service`, `residential`, `living_street`, `unclassified`, `tertiary`, and so on). Exclude ways tagged `access=private/no` or `foot=no`.
2. Split ways at intersections so junctions become nodes. Edge distances are real meters computed from geometry, not straight lines between endpoints.
3. Edge attributes: `stairs` (from `highway=steps`), `incline` if tagged, `covered` if tagged, `surface` if tagged, `road` (true if it's a vehicle road, so directions can say "walk along the road").
4. **Entrances:** use OSM `entrance=*` nodes on building outlines when available, with their names/tags. If a building has none mapped, create one entrance at the point on the building outline closest to the nearest path, mark it `"status": "estimated"`, and list it in the verification report so I can check it on campus.
5. Connect each entrance to the nearest path segment (snap by projecting onto the segment and splitting it).
6. Gates (정문, 후문, side gates) become named nodes, using official names.
7. Run a connectivity check. If parts of the network are disconnected, connect them only where geometry clearly suggests a real connection (gap under about 5 m), mark those edges `"status": "estimated"`, and report everything else instead of silently bridging it.
8. Reduce graph size by merging chains of degree-2 nodes into single edges with their full polyline geometry kept for drawing (routing stays fast; the drawn route still follows the real curve of the path).
9. Update `directions.js` so turn detection uses the actual geometry, and so street, gate, and building names are used as landmarks. Use the true polyline geometry when drawing the route.

---

## 5. Building data: complete info for every building

Every Inha building on the main campus gets an entry, including small ones (dormitories, gyms, student halls, research buildings, the library, cafeterias, administration, guard posts at gates, and so on). The extended schema:

```json
{
  "id": "b-hitech",
  "number": "…",                       
  "name": { "ko": "…", "en": "…" },
  "aliases": ["…"],                    
  "category": "academic | library | dormitory | admin | sports | food | student_services | research | other",
  "polygons": [[[x, y], …]],
  "labelPosition": [x, y],
  "entrances": ["n-…"],
  "osmIds": ["way/…"],
  "floors": { "above": 0, "below": 0, "status": "verified | unknown" },
  "description": { "ko": "…", "en": "…" },
  "floorDirectory": [
    { "floor": "1F", "items": [{ "ko": "…", "en": "…", "type": "office | classroom | lab | lounge | facility | store" }] }
  ],
  "departments": [{ "ko": "…", "en": "…", "url": "…" }],
  "amenities": {
    "wifi":        { "available": null, "networks": [], "status": "unknown" },
    "restrooms":   { "floors": [], "accessible": null, "status": "unknown" },
    "printers":    { "locations": [], "status": "unknown" },
    "elevator":    { "available": null, "status": "unknown" },
    "accessibleEntrance": { "available": null, "status": "unknown" },
    "waterFountain": { "locations": [], "status": "unknown" },
    "vending":     { "locations": [], "status": "unknown" },
    "atm":         { "locations": [], "status": "unknown" },
    "studySpace":  { "locations": [], "status": "unknown" },
    "lockers":     { "locations": [], "status": "unknown" },
    "food":        { "places": [], "status": "unknown" }
  },
  "openingHours": { "text": { "ko": "…", "en": "…" }, "status": "unknown" },
  "photo": { "src": null, "author": null, "license": null, "sourceUrl": null },
  "sources": [{ "field": "departments", "url": "…", "retrieved": "YYYY-MM-DD" }],
  "lastVerified": null
}
```

Rules:
- `status` values: `verified` (confirmed by an official source or by me on campus), `osm` (from OpenStreetMap only), `estimated` (derived by you, e.g. a guessed entrance), `unknown`.
- **Descriptions:** 2–4 sentences per building in both Korean and English, written from the facts you found: what the building is used for, main colleges/departments/offices inside, notable facilities, and a simple location hint relative to landmarks ("next to the main gate", "behind the library"). Natural, friendly tone for students. No marketing language, no invented history.
- **Departments and offices:** go through each college and department page on the official site and record which building (and floor/room, if listed) their office is in. This is the most valuable info for students, so be thorough.
- **Common room-code format:** find how Inha writes room locations on timetables (building number + floor + room, including any letters or suffixes, such as north/south wings). Document the format in the README and implement `parseRoomCode()` that turns a room code into building + floor + room. Add unit tests with real examples you found.

### Photos
- Search Wikimedia Commons for each building (Korean and English names, plus the Commons category for Inha University if one exists). Use only files with a clear free license (CC0, CC BY, CC BY-SA, public domain). Record author, license, and file page URL; show the attribution under the photo in the building panel.
- Download and serve them locally from `public/photos/<buildingId>.webp` (resize to max 1200 px wide plus a 400 px thumbnail). Never hotlink.
- **I will add my own photos.** Support this: if I place `public/photos/<buildingId>.jpg` (or .png/.webp), the optimize script converts it and uses it in preference to Commons, with "Photo: own work" attribution. Explain this in the README.
- Buildings with no photo get a well-designed fallback card: category color, building number large, building name, and a simple building icon. It must look intentional, not broken.
- Generate `PHOTOS-TODO.md` listing every building still without a real photo, in a walking order that makes taking photos efficient.

---

## 6. Facilities on the map

1. Show amenities as clear icons on the map: restrooms, ATMs, vending machines, cafés, convenience stores, cafeterias, drinking water, printers/copy centers, bicycle parking, parking, bus stops, subway entrance, AEDs, smoking areas (if mapped), and benches/rest areas (only at high zoom).
2. Amenities inside buildings (e.g., a printer on the 3rd floor) are listed in the building panel and floor directory rather than drawn at exact map points; amenities outdoors are drawn at their real location.
3. Amenity icons are grouped into toggleable **map filter chips** (Food, Restrooms, Printing, Money, Transport, Health & Safety, Study spaces), so the map isn't cluttered. At low zoom, show nothing but buildings and major landmarks.
4. Include campus-wide essential info in an "Info" panel, only with sourced facts: campus Wi-Fi connection guide (network names and how to log in, from the official IT page), library hours, cafeteria locations and hours, health center, student support offices, lost and found, security office, and emergency numbers.

---

## 7. New features (add these)

1. **"Find nearest…"**: from the selected start building, find the nearest restroom, printer, convenience store, café, ATM, cafeteria, or bus stop by actual walking distance (run Dijkstra to all candidates), then show the route. Also offer quick chips in the UI: "Nearest restroom", "Nearest printer", "Nearest food".
2. **"Use my location" (optional GPS)**: now that the map uses real coordinates, add a button that uses the browser Geolocation API to show a "you are here" dot and automatically set the nearest building as the start. Handle permission denial and inaccurate positions gracefully (show accuracy circle; if accuracy is worse than about 50 m, ask the user to confirm the start building). Only works over HTTPS, which Vercel/GitHub Pages provide. Location never leaves the device.
3. **Accessible route option**: a toggle that avoids stairs (`stairs: true` edges) and prefers accessible entrances. If no stair-free route exists, say so clearly.
4. **Room search**: typing a room code like the official timetable format returns the building, floor, and a route to it, using `parseRoomCode()`.
5. **"My classes" (stored on the device only)**: the user can add their own classes (course name, room code, day, time). The app shows "Next class" with a one-tap route from their current building. Store in `localStorage` with try/catch. No accounts.
6. **Building floor directory view**: in the building panel, a floor-by-floor list (B1, 1F, 2F, …) of what's on each floor, with amenities highlighted.
7. **"Report a mistake" link** in each building panel and the Info panel, opening a pre-filled GitHub issue (or email, configurable in one config value) with the building ID and current data, so wrong info can be fixed quickly.
8. **Data freshness**: show "Last updated" for the dataset in the About panel, and per-building "Last verified" when set.
9. **Data sources / About panel**: lists sources (official site pages, OpenStreetMap, Wikimedia Commons) with attribution and the project's purpose. Also states clearly that unverified items are marked.
10. **Landmark-rich directions**: in addition to turns, mention when the route passes a well-known landmark (library, main gate, sports field, cafeteria) and when it uses stairs or crosses a road.
11. **Offline support (PWA)**: add a web app manifest and a simple service worker that caches the app and data, so it works with weak signal on campus and can be "installed" on a phone home screen. Keep it simple and well commented.

Keep everything from the existing app (bilingual UI, dark mode, mobile bottom sheet, share links, recent routes, Map Editor) working with the new data. Update the Map Editor to handle the new schema (multiple polygons, amenity statuses, entrances), so I can correct data visually.

---

## 8. UI updates for real data

- Remove the placeholder banner.
- Status display: `verified` items show normally; `osm` and `estimated` items show normally but with a subtle info icon and tooltip ("From OpenStreetMap" / "Estimated location"); `unknown` fields show "Not yet verified" in muted text instead of being hidden. Never present unknown info as fact.
- Long building lists: the From/To pickers must handle many buildings well (group by category, search by number, Korean name, English name, aliases, and department names, so typing "컴퓨터공학" finds the right building).
- Map performance: the real map has many more shapes. Keep pan/zoom smooth on a mid-range phone (use level-of-detail: hide small paths, benches, and minor labels at low zoom; avoid re-rendering the whole SVG on every frame).
- Check label collisions on the dense real map and fix overlaps.

---

## 9. Validation and verification report

1. `npm run validate` checks: every building has an ID, number, both names, at least one polygon and one entrance, a description in both languages; every entrance connects to the graph; the graph is fully connected; every route between every pair of buildings succeeds (test all pairs); no amenity sits outside the campus area by mistake; every factual field with `status: verified` has a source; photos exist for every `photo.src` and have attribution.
2. Generate **`VERIFY.md`**: a practical checklist for me to verify on campus, ordered as a walking route, with checkboxes: buildings with estimated entrances, unknown amenities per building (Wi-Fi, restrooms per floor, printers, elevators, accessible entrances), disconnected or estimated path links, source conflicts, buildings without photos. Keep it printable and easy to fill in while walking.
3. Generate **`DATA-REPORT.md`**: a summary with counts (buildings, paths, amenities, departments mapped), percent of fields verified/osm/estimated/unknown, and all source URLs.
4. Update existing tests for the new schema, and add tests for `parseRoomCode()`, accessible routing, "find nearest", and the projection (lat/lon → meters → lat/lon round trip within 0.5 m).

---

## 10. Work plan

Work in phases. Commit after each phase with a clear message, run tests and `npm run validate` where relevant, and give me a short summary of what was found and what is still missing.

1. Network check (section 1). Stop and report if anything is blocked.
2. OSM fetch + projection + map geometry. Render the real campus outline, buildings, and paths.
3. Routing graph from real paths, entrances, connectivity check. All-pairs routing test passes.
4. Official info: building numbers and names, departments and offices, floor directories, opening hours, room-code format.
5. Amenities: OSM amenities + official facility info, map filters, Info panel.
6. Photos: Commons search, attribution, own-photo pipeline, fallback cards, `PHOTOS-TODO.md`.
7. New features (section 7).
8. UI updates for real data (section 8) and performance pass.
9. Validation, `VERIFY.md`, `DATA-REPORT.md`, README update (data sources, how to regenerate data, how to add photos, how to correct data with the Map Editor, room-code format).
10. Final check: production build works, no console errors, test the main flows on mobile width.

---

## 11. Done when

- The map shows the real Inha main campus with accurate building shapes and positions, real paths, gates, and surrounding streets, with OSM attribution.
- Every main-campus building has official number and names, a bilingual description, departments/offices where sourced, and either a licensed photo or a fallback card.
- Routing works between every pair of buildings along real paths, including the accessible (stair-free) option where possible.
- Facilities are on the map and in building panels, each with an honest status.
- Find-nearest, GPS "use my location", room search, My classes, report-a-mistake, and offline mode work.
- `npm test`, `npm run validate`, and `npm run build` all pass.
- `VERIFY.md`, `PHOTOS-TODO.md`, and `DATA-REPORT.md` exist and are accurate.
- Nothing in the data is invented: every fact has a source or is clearly marked unknown/estimated.
