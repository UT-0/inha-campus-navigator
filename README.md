# Inha Campus Navigator

A web app that helps students — especially new and international students — find their way around the Inha University campus (Incheon, South Korea).

Pick the building you are next to (**From**) and the building you want to reach (**To**). The app finds the shortest walking route, draws it on a 2D campus map and gives step-by-step directions with distance and walking time. Tap any building to see what is inside it, or search for a building, department, facility, course code or room number.

Everything runs in the browser from static files: no GPS, no login, no server.

> **Sample data.** The map currently shows a **placeholder campus** with generic names ("Engineering Hall A", "Central Library", …). It is _not_ the real Inha University layout. While `campus.json` contains `"_placeholder": true`, the app shows a small "sample data" banner. See [Replacing the placeholder data](#replacing-the-placeholder-data-with-the-real-campus) to trace the real campus with the built-in Map Editor.

---

## Screenshots

_All screenshots show the placeholder campus._

| Route on desktop                                                          | Building info and course search                                                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ![Route with step-by-step directions](docs/screenshots/desktop-route.png) | ![Building panel with the searched course highlighted](docs/screenshots/desktop-building.png) |

| Dark mode                                       | Phone (bottom sheet)                               | Map Editor                                     |
| ----------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| ![Dark mode](docs/screenshots/desktop-dark.png) | ![Phone layout](docs/screenshots/mobile-route.png) | ![Map Editor](docs/screenshots/map-editor.png) |

---

## Features

- **Shortest walking routes** between any two buildings (Dijkstra's algorithm with a hand-written binary min-heap). Buildings with several entrances automatically use the best pair of entrances.
- **Step-by-step directions** with turn icons, landmarks ("Turn right at Central Crossroads", "passing Central Library"), stairs warnings, rounded distances and an estimated walking time.
- **Interactive SVG map**: mouse-wheel zoom around the cursor, drag to pan, two-finger pinch on phones, zoom buttons, "reset view", double-click zoom and keyboard control. The camera glides to routes and buildings.
- **Animated route** with a "draw-on" effect, green **A** and red **B** pins, highlighted start and destination buildings, and clickable steps that highlight their part of the route.
- **Building panel**: names in both languages, number, category, description, floors, opening hours, departments, facilities, rooms and the courses held there, with **Start here / Go here / Zoom to building**.
- **Global search** for buildings (English, Korean, short name or number), courses (code or name), rooms, departments, facilities and places. Results are grouped; it ignores case, spaces and hyphens, tolerates small typos, and understands Korean initial consonants (ㅈㅇㄷㅅㄱ → 중앙도서관).
- **Share links**: the URL becomes `?from=…&to=…`, so a route can be copied and reopened.
- **Recent routes** (last 5) as quick chips.
- **English / 한국어** switch that updates everything instantly, including map labels. Defaults to Korean when the browser prefers Korean.
- **Light and dark mode** that follows the system until you choose, then remembers your choice.
- **Phone layout** with a full-screen map and a draggable bottom sheet (peek / half / full).
- **Accessible**: semantic HTML, ARIA combobox/listbox, visible focus, full keyboard use (including a building list as an alternative to the map), WCAG AA contrast in both themes, screen-reader announcements, and `prefers-reduced-motion` support.
- **Map Editor** (`?edit=1`) for tracing the real campus over a reference image, validating it and exporting a new `campus.json`.

## Tech stack

| What                                                          | Why                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Vite](https://vite.dev) + vanilla JavaScript (ES modules)    | Fast dev server and build, no framework to learn or explain              |
| SVG                                                           | The campus map is a custom 2D drawing, so no map library is needed       |
| CSS custom properties                                         | One set of design tokens, re-defined for dark mode                       |
| [Vitest](https://vitest.dev)                                  | Unit tests for routing, directions and search                            |
| [Prettier](https://prettier.io)                               | Consistent formatting                                                    |
| [Pretendard](https://github.com/orioncactus/pretendard) (CDN) | A font that renders Korean and English well, with a system-font fallback |

There are **no runtime dependencies**: `package.json` only lists Vite, Vitest and Prettier as dev dependencies.

## Getting started

Requirements: [Node.js](https://nodejs.org) 22.12 or newer.

```bash
npm install
npm run dev
```

Then open the address Vite prints (usually <http://localhost:5173/>).

| Command              | What it does                                 |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start the development server with hot reload |
| `npm test`           | Run all unit tests once                      |
| `npm run test:watch` | Re-run tests on every change                 |
| `npm run build`      | Build the static site into `dist/`           |
| `npm run preview`    | Serve the built site locally                 |
| `npm run format`     | Format all files with Prettier               |

### Useful URL parameters

| URL                    | Effect                                                                |
| ---------------------- | --------------------------------------------------------------------- |
| `?from=b-lib&to=b-gym` | Opens with that route already calculated (unknown ids are ignored)    |
| `?edit=1`              | Opens the Map Editor instead of the app                               |
| `?preview=1`           | Runs the app on the Map Editor's saved draft instead of `campus.json` |

## Running the tests

```bash
npm test
```

| File                       | Covers                                                                                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/dijkstra.test.js`   | Min-heap order, graph building, shortest path on a small hand-built graph, multi-entrance selection, unreachable target → `null`, start = target, data validation, and that every pair of buildings in the bundled campus is reachable |
| `tests/directions.test.js` | Merging straight segments, slight/normal/sharp left/right turns, landmarks, stairs warnings, distance rounding, walking time, Korean output                                                                                            |
| `tests/search.test.js`     | Korean and English names, initial consonants, building numbers, course codes and names, rooms, facilities, departments, typo tolerance, result grouping                                                                                |

## Building and deploying to GitHub Pages

```bash
npm run build      # outputs the static site to dist/
npm run preview    # optional: check the built site locally
```

A GitHub Pages project site is served from `https://<user>.github.io/<repository>/`, so every URL in the build must start with `/<repository>/`. This is Vite's `base` option, set in `vite.config.js`:

- `npm run build` uses `/inha-campus-navigator/` by default (`npm run dev` always uses `/`).
- Override it with the `BASE_PATH` environment variable, e.g. `BASE_PATH=/my-fork/ npm run build`, or `BASE_PATH=/ npm run build` for a custom domain or a `<user>.github.io` repository.

**Automatic deployment (recommended).** The workflow in `.github/workflows/deploy.yml` tests, builds and publishes the site on every push to `main`, setting `BASE_PATH` from the repository name. Enable it once in **Settings → Pages → Build and deployment → Source: GitHub Actions**.

**Manual deployment.** Run `npm run build` and publish the contents of `dist/` (for example to a `gh-pages` branch).

### Deploying to Vercel

`vercel.json` builds the site with `BASE_PATH=/` (Vercel serves from the domain root) and publishes `dist/`. Import the repository in Vercel (or run `vercel --prod`); no other settings are needed.

---

## Replacing the placeholder data with the real campus

All campus content lives in two JSON files — no campus data is hard-coded in the code:

- `src/data/campus.json` — the map: buildings, walkway network, places, areas.
- `src/data/courses.json` — which course is taught in which building and room.

You can edit them by hand, but the built-in **Map Editor** makes tracing much easier.

### Step by step with the Map Editor

1. **Get a reference image.** Use an official campus map (PNG/JPG/SVG) — ideally north-up and roughly to scale.
2. **Open the editor.** Run `npm run dev` and open <http://localhost:5173/?edit=1>.
3. **Start fresh (optional).** Click **New empty campus** to remove the sample buildings, paths and places. (Everything in the editor can be undone with **Ctrl+Z**.)
4. **Load the reference image.** Click **Load image…** and pick your file. Click **Fit map to image size** so one map unit equals one image pixel, then adjust the **Opacity** slider until both the image and your drawing are easy to see.
5. **Calibrate the scale.** Choose **Calibrate** (K), click two points whose real distance you know (for example both ends of a building whose length you measured on a map service) and enter the distance in meters. This sets `meta.metersPerUnit`, which all distances and walking times depend on.
6. **Draw the buildings.** Choose **Draw building** (B), click each corner of a building, and double-click (or press Enter) to finish. Fill in the form — ID (e.g. `b-60`), number, English and Korean names, category — and click **Create**. The same tool can create **areas** (green spaces, plazas, water, ground) by switching "Create as" to _Area_.
7. **Add entrances.** Choose **Add node** (N), set _Node type_ to **Entrance**, and click on the walkway right in front of each door. The entrance is attached to the nearest building automatically. Add **Gate** nodes at the campus gates.
8. **Draw the walkways.** Choose **Connect** (C). Click an entrance, then click along the path — clicking empty space adds a junction there — and finish on another node. Keep clicking to continue the path; press Esc to start a new one. Click an existing path to delete it. Every place where paths meet should be a single shared node.
9. **Add places.** Choose **Add place** (P), pick a type (bus stop, café, ATM…) and click on the map.
10. **Fine-tune.** Use **Move** (M) to drag nodes, places and building corners, and **Select** (V) to edit names, numbers, categories, label positions, path distances, and the _stairs_ / _covered_ flags.
11. **Validate.** Click **Validate**. It runs the same checks as the app (unknown nodes, buildings without entrances, disconnected parts of the network, duplicate ids). Click a problem to fly to it. Fix everything until it says _No problems found_.
12. **Test it.** Click **Preview in app** to open the app on your draft in a new tab and try a few routes.
13. **Export.** Untick **Sample data** (this removes the banner), click **Export JSON** and replace `src/data/campus.json` with the downloaded file.
14. **Show the reference image in the app (optional).** Copy the image into `public/` (for example `public/campus-map-reference.png`) and keep that file name in `meta.backgroundImage`. Set it to `null` to hide it.
15. **Add the content the editor doesn't cover** directly in `campus.json`: each building's `description`, `departments`, `facilities`, `rooms` and `openingHours` (see the schema below), and update `src/data/courses.json` with real courses, using the new building ids and room numbers.
16. Run `npm test` — the tests check that the bundled campus validates and that every building can reach every other one — then build and deploy.

The editor autosaves a draft in your browser and offers to restore it next time, so closing the tab does not lose work. It never changes the files in `src/data/` itself.

### JSON schema

#### `campus.json`

```jsonc
{
  "_placeholder": true,            // while true, the app shows the "sample data" banner
  "meta": { ... },
  "buildings": [ ... ],
  "nodes": [ ... ],
  "edges": [ ... ],
  "pois": [ ... ],
  "areas": [ ... ]                 // optional
}
```

**`meta`**

| Field                      | Type                    | Meaning                                                                                                                      |
| -------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `campusName`               | `{ en, ko }`            | Name of the campus                                                                                                           |
| `viewBox`                  | `[x, y, width, height]` | The map's coordinate space. All coordinates below use these units (x → east, y → south). Also the area shown by "Reset view" |
| `metersPerUnit`            | number                  | Real meters per map unit. Used for every distance, the scale bar and walking times                                           |
| `walkingSpeedMetersPerMin` | number                  | Walking speed for time estimates (75 m/min ≈ 4.5 km/h)                                                                       |
| `backgroundImage`          | string \| null          | Optional reference image drawn under the map at low opacity, e.g. `"campus-map-reference.png"` (a file in `public/`)         |

**`buildings[]`**

| Field           | Type           | Meaning                                                                                                                                                                                              |
| --------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | string         | Unique id, used in links and `courses.json` (e.g. `"b-lib"`)                                                                                                                                         |
| `number`        | string         | Building number shown on the map badge and searchable                                                                                                                                                |
| `name`          | `{ en, ko }`   | Full name                                                                                                                                                                                            |
| `shortName`     | `{ en, ko }`   | Shorter name used when the full name doesn't fit on the map                                                                                                                                          |
| `category`      | string         | One of `academic`, `library`, `dormitory`, `admin`, `sports`, `food`, `other` — sets the color                                                                                                       |
| `polygon`       | `[[x, y], …]`  | Outline, at least 3 points                                                                                                                                                                           |
| `labelPosition` | `[x, y]`       | Where the number badge and name are drawn (usually the center)                                                                                                                                       |
| `entrances`     | string[]       | Ids of the entrance nodes of this building. Routing picks the best one                                                                                                                               |
| `floors`        | number         | Number of floors                                                                                                                                                                                     |
| `description`   | `{ en, ko }`   | Short description                                                                                                                                                                                    |
| `departments`   | `{ en, ko }[]` | Departments and offices inside (searchable)                                                                                                                                                          |
| `facilities`    | string[]       | Facility ids: `cafe`, `printer`, `atm`, `restroom`, `convenience_store`, `restaurant`, `parking`, `elevator`, `wifi`, `study_room`, `lounge`, `lockers`, `laundry` (searchable, shown as icon chips) |
| `rooms`         | string[]       | Room numbers (searchable)                                                                                                                                                                            |
| `openingHours`  | `{ en, ko }`   | Free text, e.g. `"Mon–Fri 08:00–22:00"`                                                                                                                                                              |
| `photo`         | string         | _Optional._ Image path (in `public/`) shown instead of the photo placeholder                                                                                                                         |

**`nodes[]`** — the points of the walkway network

| Field      | Type         | Meaning                                                                                                         |
| ---------- | ------------ | --------------------------------------------------------------------------------------------------------------- |
| `id`       | string       | Unique id                                                                                                       |
| `x`, `y`   | number       | Position in map units                                                                                           |
| `type`     | string       | `entrance` (a building door), `junction` (where paths meet or bend) or `gate` (campus gate, shown with an icon) |
| `building` | string       | For entrances: the building id                                                                                  |
| `name`     | `{ en, ko }` | _Optional._ Junction and gate names are used as landmarks in directions ("Turn left at Central Plaza")          |

**`edges[]`** — walkways between two nodes (always walkable in both directions)

| Field        | Type           | Meaning                                                                    |
| ------------ | -------------- | -------------------------------------------------------------------------- |
| `from`, `to` | string         | Node ids                                                                   |
| `distance`   | number \| null | Length in meters. `null` = computed from the coordinates × `metersPerUnit` |
| `stairs`     | boolean        | Shown as steps on the map and mentioned in directions                      |
| `covered`    | boolean        | Covered walkway (tinted on the map, noted in the result)                   |

**`pois[]`** — places of interest shown as icons

| Field    | Type         | Meaning                                                                                                  |
| -------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| `id`     | string       | Unique id                                                                                                |
| `type`   | string       | `bus_stop`, `cafe`, `convenience_store`, `restaurant`, `atm`, `parking`, `restroom`, `printer` or `gate` |
| `x`, `y` | number       | Position                                                                                                 |
| `name`   | `{ en, ko }` | Name (searchable, shown in the tooltip, can be a landmark)                                               |

**`areas[]`** _(optional)_ — background shapes

| Field     | Type          | Meaning                                                                                           |
| --------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `id`      | string        | Unique id                                                                                         |
| `type`    | string        | `ground` (campus grounds; if missing, the whole `viewBox` is ground), `green`, `plaza` or `water` |
| `polygon` | `[[x, y], …]` | Outline                                                                                           |
| `name`    | `{ en, ko }`  | _Optional._ Shown in italics when zoomed in                                                       |

#### `courses.json`

```json
[
  {
    "code": "ISE3231",
    "name": { "en": "Sensor Engineering", "ko": "센서공학" },
    "building": "b-eng-a",
    "room": "201"
  }
]
```

| Field      | Type         | Meaning                                                       |
| ---------- | ------------ | ------------------------------------------------------------- |
| `code`     | string       | Course code (searchable, ignoring case and spaces)            |
| `name`     | `{ en, ko }` | Course name (searchable)                                      |
| `building` | string       | Building id from `campus.json`                                |
| `room`     | string       | Room number (should also be listed in the building's `rooms`) |

#### Data checks

When the app starts, it validates the data and logs clear console warnings for edges that point to unknown nodes, buildings without entrances, entrance ids that don't exist, duplicate ids, and parts of the walkway network that are not connected to the rest. Errors that make the data unusable (missing arrays, a missing `viewBox`, invalid coordinates or polygons) show an error screen instead of a blank page.

---

## How the routing works

_A short explanation for the presentation._

**1. The campus as a graph.** A graph is a set of points (**nodes**) connected by lines (**edges**). Our nodes are building entrances, path junctions and gates; our edges are the walkways between them, each with a length in meters. `graph.js` turns `campus.json` into an _adjacency list_: for every node, a list of its neighbours and the distance to each. Every walkway is added in both directions, because you can walk it both ways.

**2. Dijkstra's algorithm.** To find the shortest path from A to B, Dijkstra explores the graph outwards from A like a ripple:

1. Give A the distance 0 and every other node "infinity".
2. Take the **closest node not finished yet**. Its distance is now final — any other way to it would pass through nodes that are even farther away.
3. For each of its neighbours, check whether going _through_ this node is shorter than the best route known so far. If so, remember the new distance and that we came from this node.
4. Repeat until B is finished. Then follow the "came from" links backwards from B to A to get the path.

**3. The min-heap.** Step 2 needs "the closest unfinished node" over and over. Scanning a list every time is slow, so `minHeap.js` implements a **binary min-heap**: a tree stored in an array where every parent is smaller than its children, so the minimum is always at the top. Adding and removing take `O(log n)` steps instead of `O(n)`, which makes Dijkstra `O((V + E) log V)`.

**4. Several entrances.** A building can have many doors. Instead of trying every pair of doors, we add a **virtual start node** connected with distance 0 to every entrance of the start building, and a **virtual target node** connected with distance 0 to every entrance of the destination. One Dijkstra run from the virtual start to the virtual target then automatically picks the best pair of doors. The virtual nodes are removed from the result.

**5. From path to directions.** `directions.js` converts the list of nodes into sentences:

- each pair of nodes becomes a segment with a compass **bearing** (0° = north) and a length;
- consecutive segments that change direction by less than 30° are **merged** into one "walk straight" step;
- at each remaining bend, the change of direction is classified: **< 30°** straight, **30–60°** slight left/right, **60–135°** left/right, **> 135°** sharp left/right (or turn around);
- named junctions and gates, buildings the step walks past and nearby places become **landmarks**;
- distances are rounded to 10 m, and time = distance ÷ walking speed (at least 1 minute).

All of this is pure JavaScript without any DOM access, which is why it is fully covered by unit tests.

## Project structure

```
src/
├── main.js               App entry: loads data and wires the modules together
├── state.js              The single shared state object + subscribe/notify
├── data/                 campus.json and courses.json
├── i18n/                 en.js, ko.js and the t(key, params) helper
├── routing/
│   ├── graph.js          Builds and validates the walkway graph
│   ├── minHeap.js        Binary min-heap (priority queue)
│   ├── dijkstra.js       Shortest paths, multi-entrance routing
│   ├── directions.js     Path → step-by-step directions
│   └── router.js         Route service used by the UI (status codes, caching)
├── map/
│   ├── renderMap.js      Draws areas, paths, buildings and POIs into the SVG
│   ├── panZoom.js        Wheel, drag, pinch, buttons and the animated camera
│   ├── labels.js         Label visibility by zoom level
│   ├── routeLayer.js     Route line, draw-on animation, A/B pins, step highlight
│   ├── widgets.js        Zoom buttons, compass, scale bar, legend, tooltip
│   └── mapController.js  Connects the map to the app state
├── ui/
│   ├── routePanel.js     From/To pickers, swap, Find route, result card
│   ├── combobox.js       Reusable accessible searchable dropdown
│   ├── searchBar.js      Global search
│   ├── buildingPanel.js  Building information
│   ├── buildingList.js   Keyboard-friendly list of all buildings
│   ├── bottomSheet.js    Draggable sheet on phones
│   ├── settings.js       Language and theme toggles
│   ├── toast.js          Short notifications
│   └── icons.js          Hand-drawn inline SVG icons
├── editor/               Map Editor (loaded only with ?edit=1)
├── utils/                geometry, search, url, dom helpers
└── styles/               tokens, base, layout, components, map
tests/                    Vitest suites
```

### Architecture in short

- **One state object** (`state.js`) holds the selected From/To, the current route, the open building, the language and the theme. Modules change it with `setState()` and react to it with `subscribe()`; they don't talk to each other directly.
- **Pure logic is separate from the UI.** Routing, directions and search never touch the DOM, so they can be tested in Node.
- **Every visible string** comes from `src/i18n/en.js` / `ko.js` via `t(key, params)`; bilingual data uses `{ en, ko }` objects picked with `localize()`.
- **Every color, size and timing** is a CSS custom property in `src/styles/tokens.css`; dark mode only redefines the tokens.
