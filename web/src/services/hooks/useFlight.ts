import { useState, useEffect } from "react";
import api from "../../api/axios";

export const useFlightPath = (flight_id: string | null) => {
  const [images, setImages] = useState<any[]>([]);

  useEffect(() => {
    if (!flight_id) return;
    
    const fetchImages = async () => {
      try {
        const res = await api.get(`/flights/${flight_id}`);
        setImages(res.data.images || []);
      } catch (err) {
        console.error("Failed to fetch flight images", err);
      }
    };

    fetchImages();
    const interval = setInterval(fetchImages, 5000);
    return () => clearInterval(interval);
  }, [flight_id]);

  return images;
};