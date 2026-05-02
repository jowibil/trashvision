import { useState, useEffect } from 'react';
import api from '../../api/axios'; 

export function useAreas() {
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAreas = async () => {
    try {
      const response = await api.get("/areas/");
      setAreas(response.data);
    } catch (err) {
      console.error("Error fetching areas:", err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchAreas();
  }, []);

  return { areas, loading, refresh: fetchAreas };
}