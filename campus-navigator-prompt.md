# Build: Inha University Campus Navigator (Web App)

## 1. Context and goal

You are building a web app called **Inha Campus Navigator** for students at Inha University (Incheon, South Korea). This is a university midterm project, so the code must be clean, well organized, well commented, and easy to explain in a presentation.

**The problem:** Students, especially new and international students, often don't know where campus buildings are, how to walk between them, or which classes, departments, and facilities are inside each building.

**The solution:** A 2D interactive map of the whole campus with every building clearly labeled. The user picks the building they are currently next to ("From") and the building they want to reach ("To"). The app calculates the shortest walking route, draws it on the map, and shows step-by-step walking directions with distance and estimated time. The user can also tap any building to see what is inside it, and search by building, department, facility, course code, or room number.

**Keep the scope simple:** no GPS, no login, no backend server, no indoor floor-by-floor navigation. Everything runs in the browser from static files.

---

## 2. Tech stack

- **Vite + vanilla JavaScript (ES modules)**. No UI framework. Plain HTML, CSS, and JS keep the project easy to understand and explain.
- **SVG** for the map. Do not use Leaflet, Google Maps, or any map library, because the campus map is a custom 2D drawing.
- **CSS custom properties** for theming (light and dark mode).
- **Vitest** for unit tests of the routing and directions logic.
- Font: **Pretendard** (loaded from a CDN), which renders Korean and English well, with a system-font fallback stack.
- No other runtime dependencies unless clearly justified. Keep `package.json` small.
- The final build must be a static site deployable to GitHub Pages (set Vite's `base` correctly and document it).

---

## 3. Project structure

```
inha-campus-navigator/
├── index.html
├── package.json
├── vite.config.js
├── README.md
├── public/
│   └── campus-map-reference.png      # optional: traced background image (user supplies it)
├── src/
│   ├── main.js                       # app entry: loads data, wires modules together
│   ├── state.js                      # single app state object + simple subscribe/notify
│   ├── data/
│   │   ├── campus.json               # buildings, nodes, edges, POIs
│   │   └── courses.json              # course code → building + room
│   ├── i18n/
│   │   ├── en.js
│   │   ├── ko.js
│   │   └── index.js                  # t(key) helper + language switching
│   ├── routing/
│   │   ├── graph.js                  # builds the graph from campus.json
│   │   ├── dijkstra.js               # shortest path with a binary min-heap
│   │   ├── minHeap.js
│   │   └── directions.js             # turns a path into human-readable steps
│   ├── map/
│   │   ├── renderMap.js              # draws buildings, paths, labels, POIs into SVG
│   │   ├── panZoom.js                # wheel, drag, pinch, buttons, animated camera
│   │   ├── routeLayer.js             # draws + animates the route line and markers
│   │   └── labels.js                 # label visibility by zoom level
│   ├── ui/
│   │   ├── routePanel.js             # From/To pickers, swap, Go, result card
│   │   ├── combobox.js               # reusable accessible searchable dropdown
│   │   ├── searchBar.js              # global search (buildings, courses, rooms, facilities)
│   │   ├── buildingPanel.js          # building info view
│   │   ├── bottomSheet.js            # mobile draggable sheet
│   │   ├── toast.js
│   │   └── settings.js               # language + theme toggles
│   ├── editor/
│   │   └── mapEditor.js              # developer tool for tracing real campus data
│   ├── utils/
│   │   ├── geometry.js               # distance, bearing, angle, polygon centroid
│   │   ├── search.js                 # normalized + fuzzy matching, Korean-aware
│   │   └── url.js                    # read/write ?from=&to= share links
│   └── styles/
│       ├── tokens.css                # colors, spacing, radius, shadows, typography
│       ├── base.css
│       ├── layout.css
│       ├── components.css
│       └── map.css
└── tests/
    ├── dijkstra.test.js
    ├── directions.test.js
    └── search.test.js
```

---

## 4. Data model

All campus content must live in JSON. **No campus data may be hard-coded in logic files.** Swapping in real data must require editing only the JSON files.

### 4.1 `campus.json`

```json
{
  "meta": {
    "campusName": { "en": "Inha University", "ko": "인하대학교" },
    "viewBox": [0, 0, 1600, 1000],
    "metersPerUnit": 0.5,
    "walkingSpeedMetersPerMin": 75,
    "backgroundImage": null
  },
  "buildings": [
    {
      "id": "b-main",
      "number": "1",
      "name": { "en": "Main Building", "ko": "본관" },
      "shortName": { "en": "Main", "ko": "본관" },
      "category": "academic",
      "polygon": [[400, 300], [520, 300], [520, 380], [400, 380]],
      "labelPosition": [460, 340],
      "entrances": ["n-main-e1", "n-main-e2"],
      "floors": 5,
      "description": { "en": "...", "ko": "..." },
      "departments": [{ "en": "...", "ko": "..." }],
      "facilities": ["cafe", "printer", "atm"],
      "rooms": ["101", "102", "201"],
      "openingHours": { "en": "Mon–Fri 08:00–22:00", "ko": "월–금 08:00–22:00" }
    }
  ],
  "nodes": [
    { "id": "n-main-e1", "x": 460, "y": 380, "type": "entrance", "building": "b-main" },
    { "id": "j-1", "x": 460, "y": 450, "type": "junction", "name": { "en": "Central Crossroads", "ko": "중앙 사거리" } },
    { "id": "g-main", "x": 100, "y": 900, "type": "gate", "name": { "en": "Main Gate", "ko": "정문" } }
  ],
  "edges": [
    { "from": "n-main-e1", "to": "j-1", "distance": null, "stairs": false, "covered": false }
  ],
  "pois": [
    { "id": "p-bus-1", "type": "bus_stop", "x": 120, "y": 880, "name": { "en": "Bus Stop", "ko": "버스 정류장" } }
  ]
}
```

Rules:
- `category` is one of `academic`, `library`, `dormitory`, `admin`, `sports`, `food`, `other`. Each category gets its own color in the map.
- Edges are **bidirectional**. If `distance` is `null`, compute it from node coordinates × `metersPerUnit`.
- A building can have several entrances. Routing must choose the best entrance at both the start and the destination.
- Junction and gate nodes may have optional `name`s, which the directions use as landmarks.
- POI types: `bus_stop`, `cafe`, `convenience_store`, `restaurant`, `atm`, `parking`, `restroom`, `printer`, `gate`. Each gets a simple inline SVG icon (draw your own, no icon fonts or external images).

### 4.2 `courses.json`

```json
[
  { "code": "ISE3231", "name": { "en": "Sensor Engineering", "ko": "센서공학" }, "building": "b-main", "room": "201" }
]
```

### 4.3 Placeholder data (important)

I will replace the data with real Inha University data later. **Do not invent real Inha building names, numbers, departments, or positions and present them as fact.** Instead:
- Create a realistic, believable **placeholder campus** with about 12–15 buildings across all categories, about 40 nodes, enough edges to form a connected network with several alternative routes, about 10 POIs, and about 15 courses.
- Use clearly generic names such as "Engineering Hall A", "Central Library", "Student Center", "Dormitory 1", and so on.
- Add `"_placeholder": true` at the top of `campus.json`, and while it is true, show a small, unobtrusive banner in the app saying the map uses sample data.
- The README must explain exactly how to replace the placeholder data with the real campus.

---

## 5. Routing logic

### 5.1 Graph and Dijkstra
- `graph.js` builds an adjacency list from nodes and edges and validates the data. On load, log clear console warnings for: edges pointing to unknown nodes, buildings with no entrances, and disconnected parts of the graph (run a connectivity check).
- `dijkstra.js` implements Dijkstra with a binary min-heap (`minHeap.js`, written from scratch and commented, since I need to explain it). It returns `{ path: nodeId[], distance: meters }`, or `null` if no path exists.
- **Multi-entrance routing:** add a virtual source connected at distance 0 to every entrance of the start building and a virtual target connected to every entrance of the destination building, then run Dijkstra once. Strip the virtual nodes from the result.
- Keep the algorithm pure (no DOM access) so it can be unit tested.

### 5.2 Directions (`directions.js`)
Convert the node path into readable steps:
1. "Exit **{start building}** from the {nearest-side} entrance."
2. Merge consecutive segments that continue roughly straight into one step with a combined distance.
3. At each node, compute the bearing change between the incoming and outgoing segments:
   - less than 30°: continue straight
   - 30°–60°: slight left/right
   - 60°–135°: turn left/right
   - more than 135°: sharp left/right / turn around
4. Mention named junctions, gates, and nearby buildings or POIs as landmarks ("Turn right at Central Crossroads", "Walk past the Central Library").
5. End with "Arrive at **{destination}**."
6. Each step has: `{ icon, text, distanceMeters, nodeIds }` so clicking a step can highlight that segment on the map.
7. All step text goes through i18n with interpolation, and works in both English and Korean.
8. Round distances sensibly (to 10 m) and compute walking time from `walkingSpeedMetersPerMin`, shown as "about N min" (minimum 1 min).

### 5.3 Edge cases
- Same start and destination → friendly message ("You're already here!") with no route.
- No route found → clear message, and a console warning naming the disconnected nodes.
- Missing selections → disable the Go button with a helpful hint.

---

## 6. Map rendering and interaction

- Render everything into one responsive `<svg>` using `meta.viewBox`. Layers in order: background (optional image at low opacity, then green areas and ground), walkable paths (soft rounded strokes), buildings (filled polygons with a subtle shadow and a darker outline in their category color), POI icons, labels, route layer, markers.
- **Pan and zoom:** mouse-wheel zoom centered on the cursor, click-drag panning, two-finger pinch and drag on touch devices, plus on-screen +, −, and "Reset view" buttons. Clamp zoom (for example 0.5×–6×) and keep the map from being dragged fully off screen. Implement this by transforming a `<g>` element or the viewBox, smoothly and without lag.
- **Animated camera:** a `flyTo(bounds)` function that smoothly animates the view to fit a route or a building (about 600 ms with easing; instant if `prefers-reduced-motion` is set).
- **Labels:** building numbers are always visible; full names appear once zoom is high enough or on hover/selection. Labels have a halo (stroke behind text) for readability and must not overflow at small sizes.
- **Hover and tap:** hovering a building raises it slightly and shows a tooltip with its name; clicking or tapping opens the building panel. Selected buildings get a clear highlighted outline.
- **Route display:** a thick, rounded route line in the primary color with a lighter casing beneath it, drawn with a "draw-on" animation (stroke-dashoffset). Show a distinct **start marker** (green "A" pin) and **destination marker** (red "B" pin). The start and destination buildings are highlighted; other buildings fade slightly. Clicking a direction step highlights that segment.
- A small **legend** (collapsible) explaining category colors and POI icons.
- A **compass/north indicator** and a **scale bar** that updates with zoom and uses `metersPerUnit`.

---

## 7. UI and UX design

The app must look polished and modern, like a real product rather than a homework assignment.

### 7.1 Visual design
- Primary color: a deep navy blue inspired by Inha University's colors, with a bright accent for the route and interactive states. Define everything as tokens in `tokens.css`: colors, 4/8-px spacing scale, radius (12–16 px for cards), soft layered shadows, font sizes, and transition timings.
- Clean, airy layout with generous spacing, rounded cards, subtle borders, and clear visual hierarchy. Avoid clutter.
- **Light and dark mode:** follows the system setting by default, with a manual toggle that is remembered. The map colors also adapt to dark mode.
- Smooth micro-interactions: button press states, panel slide-in, hover elevation, skeleton or spinner on load. Respect `prefers-reduced-motion`.
- No logos or official university artwork; use a simple original app icon (for example a map pin combined with a book), drawn in SVG, also used as the favicon.

### 7.2 Layout
- **Desktop (≥ 900 px):** a left sidebar about 380 px wide containing the app header, global search, route panel, and results or building info; the map fills the rest. Map controls float on the map's right edge.
- **Mobile (< 900 px):** the map is full screen; a search bar floats at the top; the route panel and results live in a **draggable bottom sheet** with three snap points (peek, half, full). It must feel natural with touch and not conflict with map gestures.
- Fully responsive down to 360 px width. The page body must never scroll horizontally.

### 7.3 Components
1. **Header:** app icon, "Inha Campus Navigator" title, language toggle (EN / 한국어), theme toggle.
2. **Route panel:**
   - "From (I'm near…)" and "To (I want to go to…)" fields, built with the reusable accessible `combobox.js`: type to filter, arrow keys to move, Enter to select, Esc to close, shows building number + name + category dot.
   - A **swap button** between the fields.
   - A primary **"Find route"** button.
   - Users can also set From/To by clicking a building on the map and choosing "Start here" or "Go here" in its panel.
3. **Result card:** total distance, estimated walking time, a numbered list of direction steps with icons, a "Clear route" button, and a **"Copy share link"** button.
4. **Building panel:** name (both languages shown, current language first), number, category badge, photo placeholder area, description, floors, opening hours, departments, facilities as icon chips, rooms, and the courses held there (from `courses.json`). Buttons: "Start here", "Go here", "Zoom to building".
5. **Global search:** one search box that finds buildings (by name in either language, short name, or number), departments, facilities ("printer", "cafe"), course codes and names ("ISE3231", "Sensor"), and room numbers ("201"). Results are grouped by type. Selecting a course or room opens its building with that item highlighted. Matching is case-insensitive, ignores spaces and hyphens, and allows small typos.
6. **Recent routes:** the last 5 routes stored in `localStorage` (wrapped in try/catch), shown as quick chips in the route panel.
7. **Toasts** for short feedback ("Link copied", "No route found").
8. **Empty states:** a friendly welcome message in the route panel before any route, with a one-line hint on how to use the app.

### 7.4 Shareable links
- The URL updates to `?from=<buildingId>&to=<buildingId>` when a route is shown. Opening such a link loads the route automatically. Invalid IDs are ignored gracefully.

### 7.5 Internationalization
- Every visible string comes from `en.js` / `ko.js` via a `t(key, params)` helper. Switching language updates the whole UI and map labels instantly without reload, and the choice is remembered. Default to Korean if the browser language is Korean, otherwise English.

### 7.6 Accessibility
- Semantic HTML, proper ARIA roles for the combobox and listbox, visible focus styles, full keyboard operation (including selecting buildings on the map via a list fallback), text contrast meeting WCAG AA in both themes, and `aria-live` announcements for route results.

---

## 8. Map Editor (developer tool)

To replace the placeholder data with the real Inha campus, I need a built-in editor. Open it with `?edit=1` in the URL.

- Load a reference image (`meta.backgroundImage`, for example a traced official campus map) behind the map at adjustable opacity, with a file picker to load an image locally.
- Modes, selectable from a small floating toolbar:
  - **Add node:** click to place a junction, entrance, or gate.
  - **Connect:** click two nodes to create an edge; click an existing edge to delete it.
  - **Draw building:** click points to draw a polygon, double-click to finish, then fill a small form (id, number, names, category).
  - **Move:** drag nodes or polygon points.
  - **Delete:** remove the clicked item and its connected edges.
- Show live cursor coordinates.
- A **"Validate"** button that runs the graph checks from section 5.1 and lists problems.
- **"Export JSON"** downloads the updated `campus.json`; **"Import JSON"** loads one.
- **"Calibrate scale"**: click two points and enter the real distance in meters to set `metersPerUnit`.
- The editor must be completely separated from normal app mode and not affect regular users.

---

## 9. Code quality

- Small, focused modules with clear names. Brief comments explaining *why*, plus a header comment at the top of every file explaining its role.
- JSDoc on all exported functions.
- No global variables except the single state module. Use simple publish/subscribe so UI modules react to state changes (selected From/To, current route, selected building, language, theme).
- Handle errors visibly: if `campus.json` fails to load or is invalid, show a clear error screen rather than a blank page.
- Consistent formatting (add a Prettier config).

---

## 10. Tests

With Vitest:
- `dijkstra.test.js`: shortest path on a small hand-built graph, multi-entrance selection, unreachable target returns `null`, start equals target.
- `directions.test.js`: straight segments merge, left/right/slight/sharp turns classified correctly, landmarks mentioned, distance and time rounding.
- `search.test.js`: Korean and English matches, number matches, course codes, typo tolerance.

All tests must pass with `npm test`.

---

## 11. README.md

Include: project description and screenshots section (placeholders), features list, tech stack, how to install and run (`npm install`, `npm run dev`), how to run tests, how to build and deploy to GitHub Pages, **a step-by-step guide to replacing the placeholder data with the real campus using the Map Editor**, the JSON schema explained field by field, and a short "How the routing works" section explaining the graph and Dijkstra in simple terms for a presentation.

---

## 12. Work plan

Work in phases. After each phase, run the app and the tests, fix any problems, and briefly summarize what was done before moving on.

1. **Setup:** Vite project, folder structure, tokens and base styles, empty layout (sidebar/sheet + map area).
2. **Data + routing:** placeholder `campus.json` and `courses.json`, graph building and validation, min-heap, Dijkstra, directions, unit tests.
3. **Map:** SVG rendering of all layers, pan/zoom, labels, hover/select, legend, scale bar, compass.
4. **Route UI:** comboboxes, swap, Find route, route drawing and animation, markers, result card, step highlighting, edge cases.
5. **Building panel + global search + courses.**
6. **Polish:** i18n (EN/KO), dark mode, mobile bottom sheet, share links, recent routes, toasts, empty and error states, accessibility pass, animations.
7. **Map Editor.**
8. **README, final cleanup, production build check.**

---

## 13. Acceptance criteria

The project is done when:
- `npm install && npm run dev` starts the app with no console errors.
- Selecting any From and To building shows the correct shortest route, animated on the map, with sensible step-by-step directions, distance, and time.
- Clicking a building opens its information, including courses held there.
- Searching "ISE3231", a room number, a facility, or a building name in Korean or English finds the right result.
- The UI looks polished on desktop and on a 375 px-wide phone, in both light and dark mode, in both languages.
- Share links reproduce a route.
- The Map Editor can trace a new campus over a reference image and export valid JSON that the app loads correctly.
- `npm test` passes and `npm run build` produces a working static site.
