// web/src/services/hooks/useAreasCollection.ts
import { useEffect, useState } from "react";
import api from "../../api/axios";

/**
 * The backend payload for a single drone detection point is inconsistent
 * about field names (seen across MapView.tsx, which falls back through
 * several possible keys for the same value: e.g. `timestamp ||
 * captured_at`). Rather than pretend there's one canonical shape, every
 * alternate key is modeled as optional here, and an index signature allows
 * the remaining backend fields to pass through untyped.
 */
export interface DroneDetectionPoint {
  latitude: number | string;
  longitude: number | string;
  timestamp?: string;
  captured_at?: string;
  created_at?: string;
  detection_id?: string;
  image_id?: string;
  id?: string;
  image_url?: string;
  waste_type?: string;
  bbox_x1?: number;
  x1?: number;
  bbox_y1?: number;
  y1?: number;
  bbox_x2?: number;
  x2?: number;
  bbox_y2?: number;
  y2?: number;
  confidence_score?: number;
  confidence?: number;
  [key: string]: unknown;
}

/**
 * Perf (Heavy Lifter migration): hexbin aggregation moved server-side
 * (useAreaHexbins), so the raw collection is NO LONGER fetched on every area
 * selection. The only remaining consumer is the zoom>=18 pin layer — this
 * hook fetches lazily when `enabled` first turns true (per area), then keeps
 * the result for the session so zooming in/out and switching areas back
 * doesn't refetch.
 */
export interface CollectionWindow {
  /** Selected calendar month (1-12). Sent together with `year`. */
  month: number;
  year: number;
  /** Cumulative week cutoff (ignored by the backend in accumulated mode). */
  week: number;
  /** "month" = per-month window; "accumulated" = Jan 1 → end of month. */
  mode: "month" | "accumulated";
}

/**
 * Cache key for a windowed collection fetch. Pins and hexes must describe
 * the SAME time slice, so the key carries the full window (previously pins
 * ignored the map's date filter entirely — a 2025 pin stayed visible under
 * a 2026 calendar).
 */
const collectionKey = (areaId: string, w: CollectionWindow) =>
  `${areaId}:${w.mode}:${w.year}-${w.month}:w${w.week}`;

export const useLazyAreaCollection = (
  areaId: string | null | undefined,
  enabled: boolean,
  /** Window params; omitted = legacy all-history fetch (old behavior). */
  window?: CollectionWindow,
) => {
  const [collections, setCollections] = useState<
    Record<string, DroneDetectionPoint[]>
  >({});

  // A cache entry now exists per (area, window) — switching the calendar or
  // mode refetches instead of showing the old slice, and each fetched slice
  // stays cached for the session.
  const key = areaId && window ? collectionKey(areaId, window) : areaId;

  useEffect(() => {
    if (!enabled || !key || collections[key]) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await api.get(`/flights/areas/${areaId}/collection`, {
          signal: controller.signal,
          params: window ? { month: window.month, year: window.year, week: window.week, mode: window.mode } : undefined,
        });
        setCollections((prev) => ({ ...prev, [key]: res.data || [] }));
      } catch (err: any) {
        if (err.name !== "CanceledError")
          console.error("Collection fetch error", err);
      }
    })();
    return () => controller.abort();
    // `collections` in deps: after a successful fetch the effect re-runs,
    // hits the guard above, and stops. No loop.
  }, [enabled, key, collections]);

  return key ? collections[key] : undefined;
};