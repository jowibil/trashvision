import { useState, useEffect, useCallback } from "react";
import api from "../../api/axios";

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

  // Stabilized with useCallback: previously `fetchAreas` was a new function
  // reference on every render, which meant the `refresh` value returned by
  // this hook was also unstable — any consumer effect depending on it would
  // re-run needlessly every render.
  const fetchAreas = useCallback(async () => {
    try {
      const response = await api.get("/areas/");
      setAreas(response.data);
    } catch (err) {
      console.error("Error fetching areas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  return { areas, loading, refresh: fetchAreas };
}