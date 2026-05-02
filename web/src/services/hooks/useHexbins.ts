import { useMemo } from "react";
import * as turf from "@turf/turf";

export function useHexbinData(mockData: any[], selectedDate: Date, week: number, threshold: number, boundary: any) {
  return useMemo(() => {
    const timeFiltered = mockData.filter((p) => {
      const d = new Date(p.date);
      return (
        d.getMonth() === selectedDate.getMonth() &&
        d.getFullYear() === selectedDate.getFullYear() &&
        d.getDate() <= week * 7
      );
    });

    if (timeFiltered.length === 0) return null;

    const points = turf.featureCollection(
      timeFiltered.map((p) => turf.point([p.lng, p.lat], { ...p }))
    );

    const bbox = turf.bbox(points);
    const grid = turf.hexGrid(bbox, 0.025, { units: "kilometers" });

    if(boundary) {
      grid.features = grid.features.filter((hex)=> {
        return !turf.booleanDisjoint(hex, boundary);
      })
    }

    let processedGrid = turf.collect(grid, points, "id", "pointIds");
    processedGrid = turf.collect(processedGrid, points, "imageUrl", "images");
    processedGrid = turf.collect(processedGrid, points, "type", "types");

    processedGrid.features = processedGrid.features.filter((f) => {
      const count = f.properties?.pointIds?.length || 0;
      return count >= threshold;
    });

    return processedGrid;
  }, [week, threshold, selectedDate, mockData, boundary]);
}