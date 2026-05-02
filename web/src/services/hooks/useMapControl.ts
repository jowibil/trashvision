
import { useMap } from "react-leaflet";
import { useCallback } from "react";

export function useMapControl() {
  const map = useMap();

  const flyToLocation = useCallback((lat: number, lng: number, zoom: number = 16) => {
    if (!isNaN(lat) && !isNaN(lng)) {
      map.flyTo([lat, lng], zoom, {
        duration: 1.5,
        easeLinearity: 0.25,
      });
    }
  }, [map]);

  return { flyToLocation };
}