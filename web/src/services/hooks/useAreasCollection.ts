// services/hooks/useAreaCollection.ts
import { useState, useEffect, useCallback } from "react";
import api from "../../api/axios";

export const useAreaCollection = (areaId: string | null) => {
  const [collection, setCollection] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCollection = useCallback(async (signal?: AbortSignal) => {
    if (!areaId) return;
    setLoading(true);
    try {
      const res = await api.get(`/flights/areas/${areaId}/collection`, { signal });
      setCollection(res.data || []);
    } catch (err: any) {
      if (err.name !== 'CanceledError') console.error("Fetch error", err);
    } finally {
      setLoading(false);
    }
  }, [areaId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCollection(controller.signal);

    // No setInterval here! We only cleanup the network request.
    return () => controller.abort();
  }, [areaId, fetchCollection]);

  return { collection, loading, refetch: fetchCollection };
};