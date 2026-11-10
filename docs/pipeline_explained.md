# TrashVision Pipeline, Explained End-to-End

From **drone flight → detections → DBSCAN (Stages A & B) → CalculateLitterDensityMap (CCI) → what MapView renders.**

This is the narrative companion to `algorithm_equations.md` (the formal math). Here we cover *what each stage does, what it means, why it is built that way, and why the map looks the way it does* — including the design decisions and bug history that shaped the current behavior.

**Where the code lives:**

| Stage | Backend | Notes |
|---|---|---|
| Flight upload + Stage A | `backend/routes/flights.py` (`upload_flight_batch`, `_cluster_frames`) | |
| Stage B (inference + persist) | `backend/services/detection_service.py` (`process_image_upload`, `run_yolo_inference`) | |
| DBSCAN math (shared) | `backend/services/dbscan_service.py` (`cluster_points`) | sklearn, haversine metric |
| Hex grid + CCI inputs | `backend/services/mobile_service.py` (`calculate_hex_tiles`, `get_area_detection_stats`) | SQL/PostGIS |
| Cross-flight clustering (ROLLED BACK — see §5) | *was* `_CLUSTERING_CTES` in the same file | removed 2026-10 |
| Map rendering + CCI classification | `web/src/services/hooks/useHexbins.ts`, `web/src/pages/MapView.tsx` | Web |
| Map rendering + CCI classification | `mobile/lib/models/mobile_map_models.dart`, `mobile/lib/config/theme.dart`, `mobile/lib/screens/mapview.dart` | Mobile |

---

## 0. The one-paragraph summary

A drone flies a path over a drawn survey area and captures geotagged frames. Frames that overlap (same spot photographed within 3 m) are collapsed **once** (Stage A) so the YOLO model doesn't waste compute re-detecting the same scene; YOLO then finds trash in each surviving frame, producing **detections** — rows with a class, a confidence, a bounding box, and a lat/lng point. Detections of the *same physical item inside one frame* are merged (Stage B). On the map, detections are counted **as rows** — dedup is deliberately left to Stages A and B, NOT to map-level clustering (a cross-flight clustering pass was implemented and rolled back; §5). Finally, the detections of the chosen window are binned into hexagonal cells sized to the survey area, and each cell gets a **Clean Coast Index** — a *density* (detections per m², scaled by K=20), not a raw count — which maps to a 5-band color scale from Very Clean to Extremely Dirty. The map colors, the counts in each cell, the header metric, and the sector drawer photos are all downstream views of that one pipeline.

---

## 1. Stage 0 — The flight and the upload

An admin uploads a batch of drone frames to `POST /flights/upload-batch` with flight metadata (date, pilot, area). The backend:

1. Creates one `drone_flight_logs` row for the batch.
2. Saves each frame to a temp directory.
3. Reads **EXIF GPS** from each file (`services/gps_service.extract_gps`) — this is where a frame's latitude/longitude comes from. Frames without EXIF GPS get `None` coordinates (they can still be detected, but they can never appear on the map, because the map is spatial).
4. Reads the image dimensions (`extract_dimensions`) — stored as `image_width`/`image_height` so clients can scale bounding boxes later without decoding the full-resolution photo.

**What one uploaded file becomes at this point:** a candidate *frame* — nothing has been detected yet.

---

## 2. Stage A — Frame-level DBSCAN (ε = 3 m)

**Problem it solves:** drone survey paths overlap heavily. Consecutive photos of the same 50 m of shoreline can share 60–80% of their scene. Running YOLO on every frame would detect the same physical trash many times and burn expensive GPU minutes.

**What it does:** all geotagged frames of the batch are clustered with DBSCAN where "close" means *camera positions within 3 meters* (haversine distance — see §1.1 of the spec doc). Every cluster represents "the same spot photographed once or many times."

- Per the spec (§1.5), **noise is never discarded**: an isolated frame is its own singleton cluster — it's still a valid photo of real ground.
- Each cluster picks one **representative frame** (its first member).
- Only representatives are queued for the background pipeline (Cloudinary upload → YOLO inference). Non-representatives are stored as `DUPLICATE_SKIPPED` — kept for provenance, never processed.

**What one uploaded file becomes now:** either the representative of its spot (→ will produce detections) or a skipped duplicate (→ produces nothing).

**Why 3 m:** at typical survey altitude, frames taken from camera positions within ~3 m are near-identical scenes. This is a *practical* threshold, not a derived one — the spec fixes it as the Stage A constant.

---

## 3. Stage B — Detection-level DBSCAN (ε ≈ 2–3× GSD)

Now YOLOv8 runs on each representative frame (`ml/detect.py`, weights in `ml/weights/`). For every trash object it finds, a **Detection** row is persisted:

| Column | Meaning |
|---|---|
| `waste_type`, `confidence_score` | What the model thinks it saw, and how sure |
| `bbox_x1..y2` | Bounding box in **absolute original-image pixels** (clients scale it for display) |
| `latitude`, `longitude` | The frame's EXIF GPS — the *geographic* location of the object (all boxes in one frame share it, modulo the cluster centroid) |
| `image_id`, `image_url` | Which frame it came from (for the drawer thumbnails) |
| `timestamp` | Flight time — this is what month/week filters and "latest sighting" run on |
| `duplicate_count`, `cluster_id` | Stage B merge bookkeeping (§3.1) |
| `area_id` | The survey area the flight covered |

**3.1 — the merge:** within a *single frame*, YOLO often draws several boxes on one physical pile (a plastic bag half-covered by a bottle). Stage B clusters the boxes whose ground footprint is within **ε = 2–3 × GSD** (Ground Sample Distance = meters per pixel; the code uses `2.5 × gsd_meters`). The idea: two boxes closer than a couple of GSDs cannot be two distinct physical objects — at that separation the camera can't even resolve them as separate. Each cluster collapses into one Detection row whose `duplicate_count` records how many raw boxes were merged, and whose representative point is the cluster centroid (spec §1.6).

**Key mental model from here on:** *a Detection row is "one object instance as seen in one processed frame" — not necessarily one physical item in the world.* The map deliberately counts rows: same-run duplicates were already collapsed by A & B, and tracking one physical item ACROSS flights was tried and rolled back (§5) — so a pile re-photographed next month does count again. That is accepted product behavior, chosen over the aggressive merging that map-level clustering produced.

---

## 4. The map's time window — month vs accumulated

MapView never shows "all history" by default. The user picks a **window**, and everything downstream (hexbins, header stats, pins) filters detections to exactly that window:

| Mode | Window | Week chips | Purpose |
|---|---|---|---|
| **Per month** (default) | The selected month only; the week chip (W1–W4) cuts the *day of month* cumulatively — W2 = days 1–14, W4 = whole month | Shown | "What did this month's flights find?" — monthly reporting |
| **Accumulated** | Jan 1 → **end of** the selected month, same year (never crosses year boundaries) | Hidden | "Everything on record this year up to this month" — monitoring view with carry-over |

Both windows are defined **once** in the SQL CTE `filtered_detections` (`mobile_service.py`) and shared by the hexbin query, the header-stats query, and the pins endpoint — so the map, the header number, and the zoomed-in pins can never disagree about *when* they're looking at.

*History note: the original 2025 web map had a bug where the month filter was computed but never applied — every month showed the entire dataset. That's why "May's 240 detections carried into June" used to happen. The accumulated mode is the *deliberate* reintroduction of that carry-over, as a user-visible choice rather than an accident.*

---

## 5. Cross-flight clustering — designed, shipped, ROLLED BACK

> **Status: NOT in the code.** This was implemented (phase 2) and rolled back the same
> month (product decision 2026-10): with real data it **undercounted too aggressively** —
> merging genuinely distinct detections that happened to lie within the radius, and
> shrinking accumulated-mode counts below what stakeholders considered truthful.
> The product rule now (AGENTS.md rule 9): **map counts are detection rows; duplicate
> "trash" within a run is normalized by the pipeline's own DBSCAN stages (A and B), not
> by map-level clustering.** The design is preserved here because it is the right tool
> if re-photography inflation is ever proven (not merely suspected) and the team
> revisits it with a data-driven ε.

**Problem it aimed to solve:** flights repeat monthly along the same paths. A pile photographed in May *and* June produces one Detection row per flight. In the accumulated window the cell containing that pile counts it twice — inflating density purely because the drone came back. Re-photography is not new litter.

**What it did** (`_CLUSTERING_CTES`, since removed):

1. Clustered all detections in the window with PostGIS `ST_ClusterDBSCAN` at **ε = 5 m** (`_CROSS_FLIGHT_EPS_M`).
2. Kept one **representative** per cluster: the detection with the **latest timestamp** (`DISTINCT ON (cid) … ORDER BY cid, ts DESC`).
3. Joined every downstream count against these representatives instead of raw detections.

**What it got right (worth keeping in any future attempt):**

- Counts = physical items; the drawer showed each item's newest photo (representative = latest detection).
- A cheap "is it still there?" signal: a representative from an older month meant no later re-photograph.
- Noise preserved (spec §1.5): `minpoints = 1` → isolated detections stayed singleton clusters.

**Why it was rolled back (the honest post-mortem):**

- **ε had no defensible value.** Stage B's ε derives from camera geometry (GSD); between-flight error is GPS repeatability + path drift — a *distribution*, not a constant. 5 m was a guess. On real data it merged items that a 2 m ε would have kept apart, and nobody had ground-truth to arbitrate.
- **Accumulated mode's meaning changed invisibly.** "Jan→June" showing 310 rows vs ~90 items are both defensible numbers — but the UI said only "Accumulated", so users saw counts drop ~3× with no explanation. Trust broke before the feature could prove itself.
- **It solved a suspected problem, not a measured one.** Nobody had quantified re-photography inflation on actual survey data. If the real inflation is small, the clustering cost (aggressive merging + opacity) outweighs the benefit.

**Revisiting it later requires:** (a) measured inflation on real data (same-path re-detection rate), (b) a data-driven ε (e.g., from GPS repeatability tests), (c) surfaced terminology in the UI ("items" vs "detections"), (d) K recalibration *after*, since the unit of count changes the density scale.

---

## 6. The hex grid — sized to the area, clipped to the polygon

The filtered detections of the window are binned into hexagons, entirely in PostGIS:

1. **Grid origin/size comes from the survey polygon, not the data.** The area's drawn boundary (`areas.boundary_coordinates`) is fetched and **normalized to SRID 4326** first — historical rows were written before the srid=4326 column constraint and exist with SRID 0, which would poison every geometry op downstream ("Operation on mixed SRID geometries").
2. **Adaptive cell edge** (spec §2: grid the survey polygon): `edge = min(bbox_width, height) / 10`, computed in real meters at the boundary's mid-latitude (longitude degrees shrink by cos(latitude)), then clamped to **25 m – 1,000 m** so a tiny drawn area can't explode the payload and a huge one can't produce four mega-cells. Areas without a boundary fall back to the detections' own extent at the legacy fixed ~150 m.
3. **`ST_HexagonGrid`** generates the cells over the boundary's extent. The extent comes from `ST_Extent`, which returns a `box2d` **with no SRID at all** — it must be re-tagged with `ST_SetSRID(..., 4326)` or the grid cells inherit SRID 0 and every `ST_Contains` against the 4326 points fails. (This exact gotcha caused two production bugs; see §12.)
4. **Clipping:** each cell is `ST_Intersection`-ed with the boundary, so the map's edge follows the survey polygon's shape instead of hexagonal bleed. Cells whose intersection is empty are dropped.
5. **Per-cell geodesic area:** `hex_area_m2 = ST_Area(clipped_cell::geography)` — the *clipped* cell's real area in m², computed on the sphere (spec §2.4 explicitly forbids the planar `2.6·s²` hex formula; it distorts with latitude and survey size).

**Why adaptive sizing matters:** with fixed-size cells, a big area and a small area are not visually comparable (the small one fits inside one cell). With ~10 cells across every area's short dimension, cells describe *the area's own scale* — and because CCI is a density (next section), differing cell sizes never skew the colors.

---

## 7. CalculateLitterDensityMap — CCI per cell

For each hex cell (spec §2.1; the count is **detection rows** in the window — see §5 for why item-counting was rolled back):

```
detection_count(h) = number of detections inside h
density(h)         = detection_count(h) / hex_area_m2
CCI(h)             = K × density(h)          with K = 20
```

| CCI | Category | Color (web + mobile identical) |
|---|---|---|
| ≤ 2 | Very Clean / Very low | emerald `#10b981` |
| 2–5 | Clean / Low | blue `#3b82f6` |
| 5–10 | Moderate | amber `#f59e0b` |
| 10–20 | Dirty / High | orange `#f97316` |
| > 20 | Extremely Dirty / Very high | red `#ef4444` |

**The single most important property: CCI is size-invariant.** A 40 m cell and a 400 m cell with the same litter *density* get the same CCI and the same color. That's why raw counts were abandoned as the color driver the moment cell sizes became adaptive: "177 detections" means nothing without "over how many m²?" — see §9 for the worked example.

**K = 20** is the spec's "typical" scaling coefficient — a calibration knob, not a constant of nature (§9 shows why recalibration against real data is still an open item).

**Consistency guarantees (repo rules enforce these):**
- The web computes per-cell CCI in `useHexbins.ts` (`classifyCci`), mobile in `mobile_map_models.dart` + `theme.dart` (`getCciColor`) — same formula, same bands, same hexes. **One K (`DRONE_K_FACTOR` / `cciKFactor` = 20), one scale, both platforms.** (History: the first server-hexbin drop had web cells at K=200 while the header used 20 — cell colors 10× hotter than the summary chip. Unified in the phase-1 fix.)
- The **area header metric** (the status chip: "VERY CLEAN" over the whole survey) uses the *global* form of the same math (spec §2.2): `CCI_global = K × detection_count / area(boundary)` — and its count comes from the same windowed detection filter, so the header and the cells count the same things in the same unit.

---

## 8. What MapView actually renders, and why

**Hex polygons** — one per surviving cell, colored by CCI band, drawn only below zoom 18 (zoom in past that and the per-item pins take over). Cell labels show the detection count. The count that appears is *detection rows in the cell*, and the color is *density* — these two deliberately carry different information: a big pale cell can legitimately hold more detections than a small hot one.

**The Min/Cell slider** (1–15 monthly, 1–100 accumulated) is the SQL `HAVING COUNT >= :threshold` — "show me only cells with at least this many detections." It's a de-cluttering tool, not a severity control: raising it removes cells; it never changes anyone's color.

**Week chips** exist only in Per-Month mode and cut the *selected month's* day range cumulatively (W4 = whole month). In Accumulated mode the window always runs Jan 1 → month end, so the chips are hidden — they'd be meaningless.

**Sector drawer** — tap a cell and the app POSTs that cell's `detection_ids` to the batch endpoint (`/flights/areas/{id}/images/batch` web, `/mobile/map/images/batch` mobile), which resolves each id into a thumbnail + bounding boxes + confidence. Every detection row of the cell gets a card, in the order the backend returns them. Note the known consequence of counting rows: when the same pile is re-photographed across months (accumulated mode), the drawer shows one card per flight's detection of it — near-identical images of the same item. That overlap is the visible face of the rollback decision (§5); Stage A/B still guarantee no *within-run* duplicates. The rail is paged (20 at a time) since an accumulated cell can hold hundreds of rows.

**Community pins** (verified citizen reports) are a separate layer with their own date window, so pins and hexes always describe the same time slice.

**Why hexes and not the raw points:** a map of 10,000 dots is unreadable and uncomputable for policy; the grid + CCI turns the same data into ~50 comparable regions with a defensible, documented index behind each color.

---

## 9. Worked example — the "177 detections = Very Clean?!" case

A real cell from testing: edge ≈ 52 m (a boundary whose short dimension was ~520 m), full-hexagon area ≈ 2.6 × 52² ≈ **7,000 m²**, label said **177 detections**, color said **Very Clean**. The reading:

1. **What 177 is:** detection rows in the window — within-run duplicates already collapsed by Stage A/B, but a pile re-photographed in later months of an accumulated window contributes a row per flight (§5 rollback decision).
2. **The density math:** CCI = 20 × 177 / 7,000 ≈ **0.5** → ≤ 2 → Very Clean. And honestly so at the density reading: 177 detections spread over an 84 m × 84 m patch is roughly one per 6 × 6 m — sparse ground truth, even if some rows are re-photographs.
3. **Why it *feels* wrong:** the band thresholds (≤2 / ≤5 / ≤10 / ≤20) come from coastal-survey literature calibrated on physical item densities. With K = 20 and typical cell sizes, even a bad-looking cell lands far below 2. That is a **calibration problem, not a logic problem** — the open fix is tuning K against real survey ground-truth (a larger K shifts all cells up the scale; e.g. K=200 puts this cell at ~5, "Clean"). Reverting to raw-count coloring is NOT the answer — it's meaningless once cell sizes vary between areas.

So: the pipeline is doing the honest thing — density of detections — and the number that needs adjusting is K.

---

## 10. "Is it still there?" — what the data can and cannot say

- **Can say (cheaply, already in the data):** per cell, `MAX(timestamp)` of its detections vs the selected month. In accumulated mode, a cell whose newest detection is May while you're viewing August saw **no detection activity since May**.
- **Cannot say:** whether that means the litter was removed, or the flight path simply didn't cover that cell. Distinguishing those needs flight-path coverage analysis (which ground each flight actually photographed — the `images` table has the GPS traces) — a future feature, deliberately not faked in the current UI. Cross-flight clustering would have approximated per-item "latest sighting"; with it rolled back, the honest per-cell signal above is what remains.

---

## 11. Failure history worth knowing (why odd code exists)

| Symptom | Root cause | Fix that persists in code |
|---|---|---|
| Mobile map always empty (early) | Hex pipeline aggregated `images` filtered by `processing_status='done'`; only one row qualified | Detections carry no status gate — they only exist after successful inference |
| `mixed SRID geometries (Polygon, 0) != (Point, 4326)` | Boundary rows written pre-constraint exist with **SRID 0** | `_BOUNDARY_SELECT` normalizes: SRID 0 → `ST_SetSRID(…, 4326)`, else `ST_Transform` |
| Same error *persisting after the fix* | `ST_Extent` returns `box2d` — **no SRID**, so grid cells still inherited 0 | Explicit `ST_SetSRID(ST_Extent(geom), 4326)` around both extents |
| Browser showed CORS errors for a server bug | Unhandled 500s bypass CORSMiddleware → response had no CORS header | Hexbins route wraps the pipeline: logged traceback + opaque 500 *with* CORS headers |
| `TypeError: … reading 'status'` | Axios `error.response` is undefined for network failures; our interceptor read `.status` unguarded | Optional chaining + only redirect on a real 401 that carried a token |
| "May carries into June" (2025 behavior) | Month filter computed but never applied; map showed all history | Fixed filter; carry-over reintroduced *deliberately* as Accumulated mode |
| 177 detections colored Very Clean | Count ≠ density; K not yet calibrated for typical cell sizes | CCI kept as the honest density metric; K calibration is the open knob (§9). Map-level clustering was the first attempt and was rolled back (§5) |

---

## 12. Rules for anyone touching this pipeline

1. **One window definition** (`_DETECTIONS_CTE` + `_window_params`): hexbins, header stats, and pins must all use it. Never add a "slightly different" time filter to one consumer.
2. **Count rows; dedup belongs to Stages A & B.** Map counts are detection rows — do NOT re-introduce map-level cross-flight clustering without first measuring real re-photography inflation and deriving a defensible ε (see §5's post-mortem; AGENTS.md rule 9).
3. **One K, one band table, both platforms:** `useHexbins.ts` and `mobile/config/theme.dart` must stay in lockstep (AGENTS.md rule 7). Never reintroduce raw-count coloring or a second K.
4. **Geodesic areas only:** `hex_area_m2` comes from `ST_Area(…::geography)` of the *clipped* cell. Never the planar hex formula, never the unclipped cell.
5. **SRID discipline:** every geometry that enters a cross-geometry op must be explicitly 4326 — boundaries via `_BOUNDARY_SELECT`, extents via `ST_SetSRID(ST_Extent(…), 4326)`.
6. **Cache keys carry the mode:** `hexbins_v5:{mode}:{area}:{year}-{month}:w{week}:t{threshold}` — identical format on web (IndexedDB) and mobile (sqflite), bumped in lockstep when payload meaning changes (v3→v4 = item counts, v4→v5 = back to rows). A cache hit must never render a different mode's data.
7. **New endpoints:** passive reads → `require_public()`; anything personal or mutating → `require_role()` (AGENTS.md rule 4/8).
