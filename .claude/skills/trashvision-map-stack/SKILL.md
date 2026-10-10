---
name: trashvision-map-stack
description: TrashVision's map architecture across mobile (flutter_map + Mapbox raster) and web (react-leaflet). Use when editing mapview.dart, MapView.tsx, hexbin logic, severity/CCI classification, mobile_map endpoints, or detection payload contracts.
---

# TrashVision Map Stack

TrashVision renders the same detection data on two maps with deliberately different
architectures. Understand which side you're editing before changing anything.

## The two architectures

**Mobile (`mobile/lib/screens/mapview.dart`)** — server-aggregated:
- Fetches pre-aggregated hexbins from `GET /mobile/map/areas/{area_id}/tiles`
  (PostGIS `ST_HexagonGrid`, backend/services/mobile_service.py). Sizing is
  ADAPTIVE: cell edge = boundary bbox min(width, height) / 10, clamped to
  25–1000 m (`_HEX_EDGE_MIN_M` / `_HEX_EDGE_MAX_M`); 150 m is only the fallback
  for areas with no drawn boundary (`_DEFAULT_EDGE_M`). Cells are clipped to the
  polygon and `hex_area_m2` is the clipped geodesic area — never recompute a
  planar hex formula client-side.
- Drawer images load on tap via `POST /mobile/map/images/batch` with `detection_ids`
  (current contract) or legacy `image_ids`. HexBin carries both lists for backcompat.
- Zoom gating via `ValueNotifier<double> _zoomNotifier` (audit #14): hex polygons +
  markers hide at zoom >= 18, detection circles show only at zoom >= 18. Never
  reintroduce `setState`-per-pan-frame.
- Threshold slider is debounced (400ms) — one request per settled value.
- Hex interaction (2026-09 refactor): the PolygonLayer is the ONLY interactive
  layer — polygons carry `hitValue: hex` + on-canvas `label` counts, taps arrive
  via `LayerHitNotifier` read in `MapOptions.onTap` (flutter_map 8.3 pattern).
  Do NOT reintroduce a per-hex MarkerLayer/GestureDetector overlay (duplicate
  tap targets, widget overhead).
- Camera moves use `_animatedMove` (tweened center+zoom over `motionDuration`);
  plain `MapController.move()` reads as a teleport. Only exception: programmatic
  reset from another screen.
- Sector drawer: `DraggableScrollableSheet` (snap 0.34/0.85) on narrow screens —
  the panel list must use the sheet's `scrollController` (drag-the-list-to-move
  contract, `SectorPanel.sheetContent`). Wide screens keep the animated side panel.
- Community layer: verified report pins via
  `MobileMapService.getReportPinsCached(areaId)` (cache key `reports_v1:{areaId}`,
  `GET /reports/?status=verified&area_id=`), visible zoom >= 16, `showReports`
  toggle in the controls panel. It is a SECONDARY layer: fetch failures are quiet
  (`cloud_off` icon in the panel), never a full-screen banner. Markers are real
  widgets, so pin taps win the gesture arena over the hex hit-notifier — a pin tap
  must not open the sector drawer.
- Basemap tiles render through `MapOfflineTileCache` (see skill:
  trashvision-offline-first). Never swap the TileLayer back to a default
  `NetworkTileProvider()` without a caching provider.

**Web (`web/src/pages/MapView.tsx`)** — server-aggregated (migrated 2026-09):
- `useAreaHexbins` calls `GET /flights/areas/{id}/hexbins` — the SAME PostGIS
  Heavy Lifter pipeline mobile uses. Filter changes are debounced 300ms. The
  response also carries `total_detections` + `latest_detection_at` (header
  metrics + date-filter bootstrap via the `latestDetectionAt` effect).
- `useHexbins.ts` only converts server tiles → Leaflet FeatureCollection and
  computes CCI client-side (K=20, from the server-provided `hex_area_m2`).
- Raw detections are lazy: `useLazyAreaCollection` (lives in
  `useAreasCollection.ts`) fetches the collection ONLY when zoom >= 18 (pin layer
  needs them), windowed with the SAME month/year/week/mode params as the hexbins,
  cached per (area, window) for the session.
- Drawer details resolve on demand via `POST /flights/areas/{id}/images/batch`
  (hexbins carry detection_ids only).
- Community layer: `useReports("verified")` → GeoJSON circleMarkers, rendered
  unconditionally (no zoom gate, no toggle, no area filter). Deliberately simple:
  a plain uncached fetch whose failures are console-logged, never a banner.

## Window modes — shared contract (product decision 2026-10)

`mode=month` (per-month + cumulative week cutoff W1–W4) vs `mode=accumulated`
(Jan 1 → end of selected month, same year, no week cutoff — clients hide the
week chips). Implemented ONCE in `mobile_service.calculate_hex_tiles` /
`get_area_detection_stats` / the `/collection` date params; consumed by web
(`useAreaHexbins`, `useLazyAreaCollection`) and mobile (`MobileMapService`,
`viewMode`). Cache keys carry the mode as their FIRST segment. Pins and hexes
must always query the same window.

## Severity — ONE CCI scale on both platforms

Unified 2026-10: cells classify by CCI = K · count / geodesic cell area with
**K = 20**, bands ≤2 / ≤5 / ≤10 / ≤20 / >20. Never reintroduce raw-count
coloring or a second K factor.
- **Web**: `useHexbins.ts` — exported `DRONE_K_FACTOR` + `classifyCci`. MapView
  imports the constant; do NOT define a local copy again (the old 20-vs-200
  drift was fixed this way).
- **Mobile**: `theme.dart` — `cciKFactor`, `getCciColor` / `getCciLabel` /
  `cciScale`; `HexBin.cci` getter computes count / area · 20. Labels differ in
  wording (web "Very low → Very high", mobile "VERY CLEAN → EXTREMELY DIRTY")
  but bands and hex colors are identical — keep them that way.
- The legacy raw-count `severityScale` / `getDensityColor` / `getDensityLabel`
  still exist in theme.dart but are unused by the map — don't reach for them in
  map work.
- Backend hexbin endpoints return raw counts + `hex_area_m2` only; clients
  derive CCI (area-level web metric uses `total_detections` / boundary area · K).

## Payload contract rules

- Backend field names snake_case; mobile models translate to camelCase in `fromJson`.
- `/flights/areas/{id}/collection` (web zoom>=18 pin layer) accepts optional
  window params (`month`, `year`, `week`, `mode`) and emits BOTH `timestamp` and
  `captured_at`; `image_id` is the real source image id. Web hooks defensively
  fall back through `timestamp || captured_at`.
- Detection bbox coords are ABSOLUTE original-image pixels (`bbox_x1..y2`). Scaling
  happens client-side using `image_width`/`image_height` (backend captures them at
  upload). Never normalize server-side.
- Thumbnails go through `helper/cloudinary_helper.dart`
  (`cloudinaryTransformUrl(url, preset)` — mobile) — inserts Cloudinary
  transforms on-demand; no backend change needed. Presets in use:
  kCloudinaryThumbMedium (drawer tiles + report sheet), kCloudinaryDetailLarge
  (bounding-box dialog). kCloudinaryThumbSmall is defined but currently unused.

## Endpoint map

| Endpoint | Used by | Notes |
|---|---|---|
| `GET /mobile/map/areas` | mobile | areas + boundary GeoJSON |
| `GET /mobile/map/areas/{id}/tiles` | mobile | server hexbins (month/year/week/threshold/mode); 60/min rate limit |
| `POST /mobile/map/images/batch` | mobile | drawer images by detection/image ids |
| `GET /flights/areas/{id}/hexbins` | web | server hexbins + total/latest stats (Heavy Lifter); 60/min rate limit |
| `POST /flights/areas/{id}/images/batch` | web | on-demand drawer details by detection ids |
| `GET /flights/areas/{id}/collection` | web (zoom>=18 only) | raw detections, windowed, lazy-loaded |
| `GET /reports/?status=verified` | mobile map (adds `&area_id=`), web map (unfiltered) | community pins layer (mobile caches per area) |

Auth: map reads are PUBLIC via `require_public()` (product decision 2026-10 —
the web portal browses logged-out via "Open Forecast"): no token = anonymous
read, an invalid/expired token = 401. Never remove these guards, and never put
a write endpoint behind `require_public()` (writes stay `require_role()`).
