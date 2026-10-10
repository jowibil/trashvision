// web/src/services/hooks/useAreaHexbins.ts
import { useEffect, useState } from "react";
import api from "../../api/axios";
import {
  getMapCache,
  putMapCache,
  trimMapCache,
  AREAS_CACHE_KEY,
} from "../mapCache";

/**
 * One server-aggregated hexbin tile from
 * GET /flights/areas/{area_id}/hexbins — the same PostGIS "Heavy Lifter"
 * pipeline the mobile map uses (ST_HexagonGrid, 0.0015° edge).
 */
export interface HexbinTile {
  /** [lng, lat] ring of the hex cell (WGS84 degrees). */
  polygon: [number, number][];
  detection_ids: string[];
  count: number;
  /** Geodesic cell area in m², computed server-side. */
  hex_area_m2: number | null;
}

/** Per-detection detail resolved on demand for the sector drawer. */
export interface SectorDetection {
  detection_id: string;
  file_url: string | null;
  type: string | null;
  confidence: number;
  bbox: [number, number, number, number];
}

interface HexbinsResponse {
  tiles: HexbinTile[];
  total_detections: number;
  latest_detection_at: string | null;
}

/**
 * Perf (Heavy Lifter migration): MapView no longer downloads the entire
 * unfiltered detection collection to turf-hexbin it client-side. The server
 * aggregates cells + returns cheap header stats (total, latest timestamp)
 * over the SAME window filter.
 *
 * Window modes (product decision 2026-10):
 *  - "month": selected month + cumulative week cutoff (W2 = days 1-14).
 *  - "accumulated": Jan 1 → end of selected month, same year. Week chips
 *    are hidden client-side in this mode; `week` is ignored server-side.
 *
 * Filter changes (threshold/week sliders, date, mode) are debounced 300ms
 * so a drag fires ONE request at the settled value, matching mobile.
 *
 * Offline-first (mirrors mobile's getHexBinsCached): every request key is
 * `hexbins_v3:{mode}:{areaId}:{year}-{month}:w{week}:t{threshold}` — the
 * exact format mobile uses for its sqflite map_cache. Cached payloads
 * render immediately (stale-while-revalidate) and the network result
 * replaces them; on network failure the cached/stale tiles stay on screen
 * instead of blanking the map. The store is trimmed after each successful
 * write, protecting the areas entry from eviction — same rule as mobile.
 */
export const useAreaHexbins = (
  areaId: string | null | undefined,
  selectedDate: Date,
  week: number,
  threshold: number,
  mode: "month" | "accumulated" = "month",
) => {
  const [tiles, setTiles] = useState<HexbinTile[]>([]);
  const [totalDetections, setTotalDetections] = useState(0);
  const [latestDetectionAt, setLatestDetectionAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!areaId) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);

      // Cache key mirrors mobile's _hexBinsCacheKey format exactly.
      // v5: back to raw detection counts (map-level cross-flight clustering
      // was rolled back — v4 entries hold item counts). Mode segment stays
      // first so a stale-while-revalidate hit always matches the active mode.
      const cacheKey = `hexbins_v5:${mode}:${areaId}:${selectedDate.getFullYear()}-${
        selectedDate.getMonth() + 1
      }:w${week}:t${threshold}`;

      // Serve stale on open: cached payload for THESE filters renders
      // immediately, the network refresh replaces it below.
      const cached = await getMapCache<HexbinsResponse>(cacheKey);
      if (cancelled) return;
      if (cached) {
        setTiles(cached.tiles || []);
        setTotalDetections(cached.total_detections ?? 0);
        setLatestDetectionAt(cached.latest_detection_at ?? null);
        setIsStale(true);
        setLoading(false);
      }

      try {
        const res = await api.get<HexbinsResponse>(
          `/flights/areas/${areaId}/hexbins`,
          {
            params: {
              month: selectedDate.getMonth() + 1,
              year: selectedDate.getFullYear(),
              week,
              threshold,
              mode,
            },
          },
        );
        if (cancelled) return;
        setTiles(res.data?.tiles || []);
        setTotalDetections(res.data?.total_detections ?? 0);
        setLatestDetectionAt(res.data?.latest_detection_at ?? null);
        setIsStale(false);
        await putMapCache(cacheKey, res.data);
        // Keep the store bounded; the areas list must survive eviction
        // (mobile parity: trimMapCache(keep: {_areasCacheKey})).
        await trimMapCache(24, new Set([AREAS_CACHE_KEY]));
      } catch (err) {
        // Failure keeps whatever is on screen (cached hit or the previous
        // filter's fresh tiles — mobile mapview does the same for in-session
        // failures). A network error must never render as an empty map.
        if (!cancelled) console.error("Hexbin fetch error", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [areaId, selectedDate, week, threshold, mode, refreshKey]);

  return {
    tiles,
    totalDetections,
    latestDetectionAt,
    loading,
    isStale,
    refetch: () => setRefreshKey((k) => k + 1),
  };
};
