# LEO Ops — Satellite Data Acquisition Dashboard

A React + Vite dashboard tracking real satellites with actual orbital
mechanics, built with plain JS (no TypeScript), Tailwind CSS, `lucide-react`
icons, and `react-simple-maps` for the world map.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (defaults to `http://localhost:5173`).

Build for production with `npm run build`, preview with `npm run preview`.

## Structure

```
src/
  data/
    mockData.js            <- only nav rail labels now; everything else is real (see below)
    satelliteCatalog.js    <- tracked satellites: NORAD name/ID, color, real mission specs
  lib/
    orbitEngine.js          SGP4 propagation, orbital elements, ground tracks (satellite.js)
    geoRegions.js            lat/lon -> continent/ocean/"India" lookup (bounding-box heuristic)
    fallbackTle.js           offline TLE snapshot, used only if the live fetch fails
    color.js                 hexToRgba() helper for tinting selected-satellite UI
  hooks/
    useTleCatalog.js         fetches live TLEs from CelesTrak per satellite
    useSimClock.js           simulated clock, adjustable speed, play/pause
    useLivePositions.js      satrecs + simTime -> positions, tracks, headings
  components/
    IconRail.jsx             left nav rail (Dashboard/Datasets/Spatial/Analytics/EDA)
    SatellitePanel.jsx        mission panel: per-satellite tabs + live data + real specs
    SatelliteGraphic.jsx      decorative inline SVG satellite illustration
    MapPane.jsx                wires the map modes + overlays together
    MapView.jsx                 2D tracks map (react-simple-maps/SVG) — original, untouched
    ImageryMap.jsx               2D map (Leaflet) with dynamic GIBS/Sentinel-Hub tile overlay
    Globe3D.jsx                  3D globe (react-globe.gl) — touch/scroll/drag interactive
    IssStreamCard.jsx            floating, draggable ISS live-video card
    StatsOverlay.jsx           draggable live telemetry card
    LegendPanel.jsx             draggable satellite legend
    SimControls.jsx             draggable play/pause + time-acceleration controls
  App.jsx                    layout, responsive behavior, shared selection state
```

## Responsive behavior

- **Desktop (lg and up, ≥1024px):** icon rail + fixed mission panel + map,
  with the telemetry/legend/controls cards floating (and draggable — see
  below) over the map.
- **Tablet/mobile (< lg):** the icon rail is replaced by a bottom tab bar, and
  the mission panel becomes a slide-over drawer — opened from a button in the
  top-left of the map, or automatically when you pick a satellite from the
  map/legend/telemetry card. The legend is hidden below `lg` to avoid
  crowding; the telemetry card stays visible from `sm` up. All three map
  modes (2D/Imagery/3D) and the ISS video card work down to phone width.

## Live satellite tracking

The map shows real satellites, propagated with actual orbital mechanics — no
mock coordinates anywhere.

**How it works**

- `src/data/satelliteCatalog.js` — the list of tracked satellites (Sentinel-1A,
  ISS, NOAA-19, Terra, Landsat-8, Sentinel-2A by default — **Sentinel-1A is the
  default selection**, set via `DEFAULT_SATELLITE_ID`), each with a NORAD
  name/ID, a fixed display color, and real publicly-documented mission specs
  (agency, launch date, orbit type, instrument, purpose, revisit cadence).
- `src/hooks/useTleCatalog.js` — fetches each satellite's current TLE (Two-Line
  Element set — the standard orbital-elements format the whole satellite
  tracking industry uses) from **CelesTrak**
  (`celestrak.org/NORAD/elements/gp.php`), a free public feed of orbital
  elements refreshed from US Space Force tracking data — but **only once
  every 2 hours per satellite**, cached in `localStorage`. CelesTrak only
  updates GP data every 2 hours and explicitly enforces this with HTTP 403s;
  fetching more often than that isn't just wasteful, it can get your IP
  temporarily firewalled, which shows up as *every* satellite failing at
  once (not just one) — if you see that, it's this, not a bug in the app,
  and it clears on its own once the block ages out (there's nothing the
  frontend can do to lift an active block — repeated requests while blocked
  don't help and can extend it). Two more protections against making that
  worse: a 10-minute cooldown after any failed attempt (so a blocked IP
  isn't immediately retried on the next reload either), and a de-duplicated
  in-flight request per satellite (React 18 StrictMode intentionally
  double-invokes effects in dev, which would otherwise turn every fetch
  into two near-simultaneous requests). If a fetch does fail, it falls back
  to the last real TLE it successfully cached (for any satellite, as long
  as it's under 7 days old — beyond that, SGP4 accuracy degrades too far to
  be worth showing), and only after that to a bundled snapshot in
  `src/lib/fallbackTle.js` (currently only populated for ISS — see the
  comment in that file for why the others are deliberately left out rather
  than guessed at).
- `src/lib/orbitEngine.js` — wraps **`satellite.js`**, a JS port of the SGP4/SDP4
  propagator (the same algorithm family used industry-wide) to turn a TLE + a
  point in time into a lat/lon/altitude/velocity, real orbital elements
  (inclination, eccentricity, period, apogee/perigee — computed straight off
  the TLE, not hardcoded), and a ground track (with antimeridian-crossing
  splitting so tracks don't draw a spurious line across the whole map).
- `src/hooks/useSimClock.js` — a clock that runs at an adjustable multiple of
  real time (1×/60×/200×/1200×, via the bottom-left play/pause + speed
  control) so LEO satellites — which circle Earth roughly every 90 minutes —
  visibly move instead of crawling.
- `src/hooks/useLivePositions.js` — combines the satrecs + simulated time into
  positions each tick, recomputing the (more expensive) ground track only
  every few simulated minutes rather than every frame.
- `src/lib/geoRegions.js` — a lightweight lat/lon → continent/ocean lookup
  (India gets its own explicit check) used to show "currently over X" in the
  mission panel, the telemetry card, and a banner on the map itself when any
  tracked satellite is passing over India. It's a bounding-box heuristic, not
  true reverse geocoding — see the comment in that file for how to swap in a
  real point-in-polygon lookup if you need border-accurate results.

**Selecting a satellite** is a single piece of state lifted to `App.jsx` and
shared everywhere: the tabs at the top of the mission panel, clicking a
marker on the map, and clicking a row in the legend or telemetry card all set
the same `selectedId`. The selected satellite gets a brighter marker, a
thicker ground track, and its full mission specs in the left panel; the rest
dim slightly so the selection reads clearly on a busy map.

**Swapping the satellite list:** edit `satelliteCatalog.js` — add an entry
with a CelesTrak-matchable `name`, a `norad` ID, a `short` label, a `color`,
and the mission-spec fields (`agency`, `launched`, `orbitType`, `instrument`,
`purpose`, `revisit`, `refAltitudeKm`, `refInclinationDeg`); everything else
(fetching, propagation, tabs, rendering) picks it up automatically. If you
want an offline fallback for it too, add a verified TLE to `fallbackTle.js`.

**Going further:** for production use, don't hit CelesTrak directly from the
browser on every load — add a small backend endpoint that fetches and caches
TLEs (they only need refreshing every few hours) and proxies them to the
client; this also sidesteps any CORS/rate-limit flakiness. For border-accurate
"currently over" instead of the bounding-box approximation, swap
`geoRegions.js` for a point-in-polygon check (e.g. Turf.js) against a real
countries GeoJSON.

## Map modes, imagery overlays & ISS video

The map toolbar (top-left) now has three modes, plus an ISS live-video toggle:

- **2D** — your original `MapView.jsx` (react-simple-maps/SVG), completely
  unchanged.
- **Imagery** — `ImageryMap.jsx`, a Leaflet map with a dark basemap plus a
  **dynamic tile overlay that changes with the selected satellite**:
  - **Terra** → NASA GIBS (`src/lib/imagery.js` builds the WMTS URL,
    including the `{currentDate}` calculation — defaults to yesterday, since
    same-day GIBS tiles are often not fully processed yet).
  - **Sentinel-2A** → Sentinel Hub WMS, `TRUE-COLOR-S2L2A` layer.
  - **Sentinel-1A** → Sentinel Hub WMS, a SAR backscatter layer (you name
    this yourself in your own Sentinel Hub configuration — see below).
  - **ISS / NOAA-19 / Landsat-8** → an honest "no imagery source configured"
    message rather than a guessed, likely-broken layer ID (GIBS is
    MODIS/VIIRS-based, so it doesn't cover NOAA-19's AVHRR; Landsat's 16-day
    revisit doesn't suit a "current imagery" overlay).

  **The Sentinel Hub layer needs your own instance ID** — copy `.env.example`
  to `.env`, create a free account + OGC/WMS configuration at
  [dataspace.copernicus.eu](https://dataspace.copernicus.eu) (Sentinel Hub
  dashboard), and put the instance ID in `VITE_SENTINELHUB_INSTANCE_ID`.
  Nobody can ship you a working one — it's tied to your account and quota.
  Until it's set, Imagery mode shows a clear banner instead of silently
  failing. `imageryConfig.js` documents exactly which satellite maps to
  which layer, and how to add more.

  **Instance ID set but tiles still blank?** This is almost always a *layer
  name* mismatch, not an auth problem — confirmed: WMS/OGC requests only need
  the instance ID, no OAuth token (that's only required for Sentinel Hub's
  newer Process/Catalog/Batch APIs). Two things to check, in order:
  1. Click **"Blank tiles? View available layers on this instance"** in the
     Imagery banner — it opens a GetCapabilities request (plain XML, no
     auth) listing every layer name your instance actually has. If
     `TRUE-COLOR-S2L2A` / `SENTINEL1-SAR-BACKSCATTER` isn't in that list,
     set `VITE_SENTINELHUB_S2_LAYER` / `VITE_SENTINELHUB_S1_LAYER` in
     `.env` to whatever name *is* there.
  2. A Sentinel Hub instance is normally built from **one** template — an
     instance created from the "Sentinel-2 L2A" template typically has no
     Sentinel-1 layer at all, and vice versa. If only one of the two
     satellites ever shows imagery, you likely need a **second instance**
     (built from the other satellite's template) — set
     `VITE_SENTINELHUB_S1_INSTANCE_ID` / `VITE_SENTINELHUB_S2_INSTANCE_ID`
     to override the shared ID per satellite (see `.env.example`).
- **3D** — `Globe3D.jsx` (`react-globe.gl`/three.js), same live positions and
  tracks as the other two modes, fully touch/scroll/drag interactive
  (auto-rotates until you touch it).

**ISS Live** (video-camera icon, top toolbar) toggles a floating video card
showing NASA's current live Earth-view camera feed from the ISS's Harmony
module, embedded via YouTube. Note: the old HDEV experiment (the classic
"ustream.tv" ISS feed) stopped transmitting in 2019 and was formally retired
— Ustream itself no longer exists either — so this points at NASA's current
successor stream instead. If NASA rotates the video ID, grab the fresh one
from `youtube.com/@NASA/live` and update `ISS_LIVE_EMBED_URL` in
`IssStreamCard.jsx`.

## Draggable overlay panels

Live Telemetry, the satellite legend, the sim-time controls, and the ISS
video card are all free-draggable within the map panel — drag by the grip
handle in each card's header (`src/hooks/useDraggable.js`); the rest of each
card (buttons, scroll areas) stays normal and click/scrollable. Position is
clamped to the map panel's bounds and re-clamped on resize, so a panel can
never end up stranded off-screen. **Spatial Explorer's Spatial Inspector
panel uses this exact same hook and header chrome** (grip handle, same
`bg-ink-900/90 backdrop-blur border-ink-700/70` styling) — it used to be
fixed in place with a slightly different look, which is why it read as
inconsistent with the rest of the app; it's now visually and behaviorally
identical to the other floating panels. This is deliberately a lightweight
pointer-drag hook rather than a full grid-layout library (e.g.
`react-grid-layout`) — these are small floating instruments over a map, not
a resizable dashboard grid, so free positioning fit better than snap-to-grid
reflow. Position isn't currently persisted across reloads; if you want that,
it's a small addition to `useDraggable` (write `position` to `localStorage`
keyed by a panel id, read it back as the initial value).

## Other pages

The icon rail's other nav items are real pages, not just dashboard variants:

- **Datasets** (`src/pages/DatasetsPage.jsx`) — a Dataset Explorer: search,
  type/status filters, a card list (`components/dataset/DatasetCard.jsx`),
  and a Metadata Inspector side panel (`MetadataInspector.jsx`, tabs for
  Overview / Schema / Granules). All mock, from `src/data/datasets.js` — 8
  realistic entries (ICESat-2, Sentinel-1/2, Landsat 8, Copernicus DEM,
  GEDI) covering all four dataset types and all three statuses, so the
  filters have something to actually filter. Card thumbnails are procedural
  SVG patterns per type (`DatasetThumb.jsx`), not fabricated imagery.
- **Spatial Exp.** (`src/pages/SpatialExplorerPage.jsx`) — a layer-stack +
  map + inspector workspace, mixing real and mock data honestly:
  - **Real:** the "Live Satellite Tracks" layer is the exact same
    CelesTrak-fetched, SGP4-propagated data as the Dashboard (shared feed,
    not a second copy). Clicking anywhere on the map fetches **real
    elevation** for that point from Open-Meteo's Elevation API
    (`src/lib/elevation.js`), which is backed by the Copernicus DEM — free,
    no key, genuine CORS support for direct browser calls.
  - **Mock, clearly labeled as such in the UI:** dataset footprint boxes
    (bounding boxes from the `datasets.js` catalog, not a live catalog
    query), the AOI presets (`src/lib/spatialMock.js` — cycle with "New
    AOI"; a real click-drag draw tool would need a library like
    `leaflet-draw`, not wired up yet), and the "band signature" chart in the
    inspector (`src/lib/mockSpatialSample.js` — illustrative only; a real
    version needs an actual raster/reflectance data source, which none of
    the free APIs used elsewhere in this app provide).
  - The coordinate grid layer is real graticule geometry (true 20°
    meridians/parallels), just not tied to any dataset.
- **Analytics** (`src/pages/AnalyticsPage.jsx`) — an "Analytics Studio" styled
  around a real, computed core rather than the reference mockup's fictional
  ML pipeline:
  - **Real:** pick two AOI presets (same ones from Spatial Explorer,
    `lib/spatialMock.js`), hit "Run Analysis", and it fetches a live
    elevation profile for each (Open-Meteo/Copernicus DEM, batched via
    `fetchElevationProfile` in `lib/elevation.js`) and computes actual
    statistics from the results — mean, std dev, Pearson correlation
    between the two profiles, real histograms of the fetched values
    (`lib/stats.js`). The chart, variance matrix, and bottom summary
    sentence are all generated from that live response, not canned. Charts
    are hand-rolled SVG (`components/analytics/`), matching the existing
    `BandChart.jsx` pattern — no new charting dependency.
  - **Explicitly simulated, not real:** the "Model Execution" panel (task
    dropdown, model version, mock run log). The reference mockup depicts a
    full ML backend — model registry, tile-processing rates, pipeline
    status — none of which exists without an actual trained model and
    server, so this panel says so directly in the UI and plays a scripted
    demo log when you run an analysis, rather than pretending to compute
    something it can't. Export buttons (Zarr/TIF/API) are disabled with an
    honest tooltip for the same reason.
  - The KPI strip reports real numbers (elevation range, correlation,
    samples fetched, last-run time) instead of the mockup's invented
    Coverage/Density/Accuracy — those specific metrics only mean something
    with a real trained model behind them, which we don't have yet.
- **EDA** (`src/pages/EDAPage.jsx`) — built as an explicit mock, per-dataset
  breakdown: summary tiles, data quality bar, statistics + distribution for
  a selected numeric column, a correlation matrix, categorical breakdown,
  and spatial info, plus a disabled "Open Deep EDA" button (honest tooltip —
  a real profiling run needs a Python/Streamlit backend). Unlike Analytics,
  this couldn't go real yet: EDA's whole job is per-column statistics of a
  *specific dataset's actual rows*, and there's no elevation-API-style
  shortcut for that — it needs `datasets.js` to stop being metadata-only.
  What IS real here: the dataset picker, column names, row/column counts,
  bounding box, CRS, and date range are all pulled straight from the
  catalog — only the missing/duplicate percentages, descriptive statistics,
  histograms, correlation values, and category counts are seeded mock data
  (`src/lib/mockEdaStats.js`, same deterministic-by-id pattern as the other
  mock generators in this app, so switching datasets gives consistent
  numbers instead of jittering). A banner in the page header says so
  directly, and the two paragraphs under Summary/Spatial Analysis spell out
  exactly which fields are real vs mock.

## Notes

- The world map basemap (`countries-110m.json`), the Imagery mode's dark
  basemap tiles, and the 3D globe's Earth texture all load from CDNs at
  runtime, so an internet connection is required in the browser running the
  app (not just at build time) — same for the live TLE fetch from CelesTrak
  and any GIBS/Sentinel Hub imagery tiles.
- Colors, spacing, and the type scale live in `tailwind.config.js` under the
  `ink` (neutrals) and `signal` (status accents) palettes — adjust there to
  re-theme or add a color for a new tracked satellite.
