// services/hooks/useAreaCollection.ts
import { useState, useEffect, useCallback } from "react";
import api from "../../api/axios";

/**
 * The backend payload for a single drone detection point is inconsistent
 * about field names (seen across MapView.tsx and useHexbins.ts, which both
 * fall back through several possible keys for the same value: e.g.
 * `timestamp || captured_at || created_at`). Rather than pretend there's one
 * canonical shape, every alternate key is modeled as optional here, and an
 * index signature allows the remaining backend fields to pass through
 * untyped (useHexbins.ts spreads the full object into each turf point).
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

export const useAreaCollection = (areaId: string | null) => {
  const [collection, setCollection] = useState<DroneDetectionPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCollection = useCallback(
    async (signal?: AbortSignal) => {
      if (!areaId) return;
      setLoading(true);
      try {
        const res = await api.get(`/flights/areas/${areaId}/collection`, { signal });
        setCollection(res.data || []);
      } catch (err: any) {
        if (err.name !== "CanceledError") console.error("Fetch error", err);
      } finally {
        setLoading(false);
      }
    },
    [areaId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchCollection(controller.signal);

    // No setInterval here! We only cleanup the network request.
    return () => controller.abort();
  }, [areaId, fetchCollection]);

  return { collection, loading, refetch: fetchCollection };
};