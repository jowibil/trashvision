import { useState, useEffect, useCallback } from "react";
import api from "../../api/axios";
import { getMapCache, putMapCache, AREAS_CACHE_KEY } from "../mapCache";

// GeoJSON.* types are already available ambiently via @turf/turf's and
// leaflet's own type dependencies (same pattern used in useReports.ts),
// so no new package is introduced by referencing them here.
export interface Area {
  area_id: string;
  area_name: string;
  center_latitude: number;
  center_longitude: number;
  boundary: GeoJSON.Feature | GeoJSON.Geometry;
  category?: string;
}

export function useAreas() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);

  // Stabilized with useCallback: previously `fetchAreas` was a new function
  // reference on every render, which meant the `refresh` value returned by
  // this hook was also unstable — any consumer effect depending on it would
  // re-run needlessly every render.
  const fetchAreas = useCallback(async () => {
    setLoading(true);

    // Cache-first (mobile getAreasCached parity): render the last known
    // area list immediately, then revalidate against the network below.
    // An offline startup still gets a usable area picker instead of a
    // blank one. `areas_v1` is the key mobile protects during trim.
    const cached = await getMapCache<Area[]>(AREAS_CACHE_KEY);
    if (cached && cached.length > 0) {
      setAreas(cached);
      setLoading(false);
      setIsStale(true);
    }

    try {
      const response = await api.get("/areas/");
      setAreas(response.data);
      setIsStale(false);
      await putMapCache(AREAS_CACHE_KEY, response.data);
    } catch (err) {
      // Network failure keeps whatever is on screen (cache hit or empty) —
      // an error must never be masked as legitimately-empty data.
      console.error("Error fetching areas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  return { areas, loading, isStale, refresh: fetchAreas };
}