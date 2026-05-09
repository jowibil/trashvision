import { useMemo } from "react";
import * as turf from "@turf/turf";

export function useHexbinData(
  data: any[],
  selectedDate: Date,
  week: number,
  threshold: number,
  boundary: any,
) {
  return useMemo(() => {
    if (!data || data.length === 0) return null;

    const filtered = data.filter((p) => {
      if (!p.date) return true;
      const d = new Date(p.date);
      return d.getMonth() === selectedDate.getMonth();
    });

    if (filtered.length === 0) return null;

    const points = turf.featureCollection(
      data.map((p) => turf.point([p.longitude, p.latitude], { ...p })),
    );

    const bbox = boundary
      ? turf.bbox(turf.polygon(boundary.coordinates))
      : turf.bbox(points);

    const [minX, minY, maxX, maxY] = bbox;
    const widthKm = turf.distance([minX, minY], [maxX, minY], {
      units: "kilometers",
    });
    const heightKm = turf.distance([minX, minY], [minX, maxY], {
      units: "kilometers",
    });

    const cellSize = Math.min(widthKm, heightKm) / 10;

    console.log(
      `bbox: ${widthKm.toFixed(3)}km x ${heightKm.toFixed(3)}km, cellSize: ${cellSize.toFixed(4)}km`,
    );

    const grid = turf.hexGrid(bbox, cellSize, { units: "kilometers" });

    if (boundary) {
      grid.features = grid.features.filter(
        (hex) => !turf.booleanDisjoint(hex, boundary),
      );
    }

    let processedGrid = turf.collect(grid, points, "image_id", "pointIds");
    processedGrid = turf.collect(processedGrid, points, "file_url", "images");
    processedGrid = turf.collect(processedGrid, points, "type", "types");
    processedGrid = turf.collect(processedGrid, points, "detections", "allDetections");

    processedGrid.features = processedGrid.features.filter((f) => {
      const count = f.properties?.pointIds?.length || 0;
      return count >= threshold;
    });

    return processedGrid;
  }, [week, threshold, selectedDate, data, boundary]);
}
