---
name: trashvision-offline-first
description: Offline-first and caching patterns for TrashVision. Use when adding offline support, caching API data or map tiles on mobile, touching the report outbox/ledger (sqflite), SyncService, MapOfflineTileCache, or connectivity handling. Covers flutter_map 8.3 tile-cache internals discovered by auditing its source.
---

# TrashVision Offline-First

TrashVision's mobile app must work in the field (rural drone-survey areas with poor
connectivity). Offline support is a product requirement, not a nice-to-have.

## What already exists (do not duplicate or break)

- **Report outbox + ledger** — `mobile/lib/helper/database_helper.dart` (sqflite, schema v4):
  `report_outbox` holds unsynced reports; `moveReportToLedger()` archives a synced report
  into `report_ledger` in ONE transaction. Never revert to deleting synced reports —
  Profile's offline history depends on the ledger.
- **SyncService** — `mobile/lib/services/sync_services.dart`: singleton, `_isSyncing` latch,
  triggered at startup + on `Connectivity().onConnectivityChanged`. Snackbars only on
  failure (silent on full success to avoid toast spam).
- **ApiClient 401 flow** — `mobile/lib/services/api_client.dart` (http-based, NOT dio):
  `onUnauthorized` latch + `markSessionValid()`. All offline paths must check
  `ApiClient.authToken()` + `JwtDecoder.isExpired()` BEFORE iterating an outbox
  (see SyncService Step 3 fix).

## Map API cache (sqflite `map_cache`, schema v4) — the implemented pattern

The cache-then-network pattern is IMPLEMENTED for the map — reuse it, don't rebuild:

- **Storage**: `map_cache` table in `DatabaseHelper` (generic key/value JSON,
  `updated_at` bumped per write). `getMapCache` never throws (null on
  miss/corruption); `putMapCache` / `trimMapCache` / `clearMapCache` are
  best-effort. `trimMapCache` bounds the store (default 24 entries) with a
  `keep` set — mobile always keeps `areas_v1` alive.
- **Service**: `MobileMapService.getAreasCached / getHexBinsCached /
  getReportPinsCached` return `CacheResult<T>(data, fromCache)`. Flow: read
  cache first → try network → persist + return fresh → on network failure WITH
  cache, return the cached payload flagged `fromCache`; with NO cache, surface
  the original error (null / rethrow) — never mask failure as empty data.
- **Cache keys** (lockstep with web, see below): `areas_v1`,
  `hexbins_v5:{mode}:{areaId}:{year}-{month}:w{week}:t{threshold}` (mode segment
  FIRST so a stale hit always matches the active window mode), and
  `reports_v1:{areaId}`.
- **UI**: mapview renders cached data immediately (`showingCachedData`); error ≠
  empty — "Offline — showing cached map data." vs a retryable error are distinct
  messages.

### Adding the pattern to a NEW fetch-heavy screen

1. Persist the last successful response keyed by ALL its request params in
   `map_cache` — no schema bump needed anymore, it's a generic key/value table.
2. Serve stale on open, revalidate in background; keep stale visible on failure.
3. Error ≠ empty — always. Network failure and legitimately-empty data must
   render differently, and a cache hit after a failed refresh says "showing
   cached data", not "error".
4. Cached models need `toJson()` symmetric with `fromJson()` — keep them in sync
   (AreaModel / HexBin / ReportPin already comply).
5. Call `trimMapCache(keep: {areas_v1})` after writes so the store stays bounded.

### Web counterpart (IndexedDB mirror)

`web/src/services/mapCache.ts` mirrors `map_cache` with the SAME contract:
get-never-throws (null on miss/failure/corruption), best-effort put/trim/clear,
LRU cap 24 with a protected `keep` set, and the SAME cache keys — `areas_v1`
and `hexbins_v5:{mode}:{areaId}:{year}-{month}:w{week}:t{threshold}`. Consumers:

- `useAreas` — cache-first on open (area picker usable offline), revalidate;
  returns `isStale`.
- `useAreaHexbins` — stale-while-revalidate per filter key; on network failure
  the stale tiles stay on screen (never blank the map); returns `isStale`.
- MapView surfaces `isStale` as a "Cached" chip next to Refresh Area.
- Deliberately NOT cached: `useReports` (web community pins — a secondary layer
  with quiet failures).

Keep the web and mobile key formats/versions in lockstep when changing either
side — bump BOTH when the payload shape changes (v4 → v5 happened when map-level
cross-flight clustering was rolled back).

## flutter_map 8.3 tile caching — `MapOfflineTileCache` (implemented)

Audited flutter_map 8.3.0 source: `NetworkTileProvider`'s default
`BuiltInMapCachingProvider` DOES write tiles to disk, BUT in
`NetworkTileImageProvider._loadImage` any `ClientException` (offline failure)
calls `evict()` and rethrows — a stale-but-present tile is DELETED instead of
served. Fresh tiles work; stale ones don't survive the first offline load.

**The fix is implemented** — `mobile/lib/services/map_offline_tile_cache.dart`,
wired in mapview.dart as:

```dart
tileProvider: NetworkTileProvider(
  cachingProvider: MapOfflineTileCache.instance,
  silenceExceptions: true,
),
```

Behavior contract (preserve when editing):

- `getTile` NEVER deletes/evicts on read — a cache hit always returns bytes;
  corrupt reads behave as a miss, not a purge (deleting on read is exactly the
  built-in behavior that fails offline).
- `putTile` forces `staleAt` = now + 90 days, ignoring server cache headers —
  cached tiles skip the network entirely until `clear()` or eviction. Survey
  basemaps don't change meaningfully; freshness is handled by clear + app
  updates, not per-session HTTP.
- Storage: application SUPPORT directory (`map_tile_cache/`), NOT the OS cache
  dir, so Android/iOS can't silently wipe it. Cap 150 MB with 20% oldest-first
  eviction (so eviction isn't triggered on every write).
- Cache key: tile URL minus volatile query params (`access_token`), hashed to a
  stable base36 filename — deterministic across app restarts.
- File format: one header line (`staleAtMillis\n`) + raw tile bytes.
- `clear()` bumps a `generation` counter and notifies listeners (screens can
  rebuild their TileLayer when the cache meaningfully changes).

Mapbox raster tiles here are 512px with `zoomOffset: -1` (see
`AppConfig.mapboxTileTemplate`) — keys are computed from the resolved URL, so
this is handled implicitly.

Do NOT swap the TileLayer back to a bare `NetworkTileProvider()` — that
silently reverts the app to evict-on-offline-failure.

## Platform gotchas

- **connectivity_plus v6+/v7**: `checkConnectivity()` returns
  `List<ConnectivityResult>`; test `.contains(ConnectivityResult.none)` (the
  `== none` comparison is always false).
- **Windows dev machines**: native symlink creation is blocked (`Operation not
  permitted`). If you ever need to link skill/tool dirs, use directory
  junctions: `cmd //c "mklink /J <name> <target>"`.
- Timeout budget lives in `ApiClient.timeout` (15s) — tile/data caches should
  not depend on it; set their own budgets (MapOfflineTileCache: 90-day
  freshness, 150 MB cap).
