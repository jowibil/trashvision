// web/src/services/hooks/useHexbins.ts
import { useMemo } from "react";
import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import type { HexbinProperties, PollutionCategory } from "../../types/types";
import type { DroneDetectionPoint } from "./useAreasCollection";

// Calibrated K-Factor for 30m spatial drone grid cells
export const DRONE_K_FACTOR = 200;

export function classifyCci(cciValue: number): PollutionCategory {
  if (cciValue <= 2) return "Very low";
  if (cciValue <= 5) return "Low";
  if (cciValue <= 10) return "Moderate";
  if (cciValue <= 20) return "High";
  return "Very high";
}

export function useHexbinData(
  data: DroneDetectionPoint[],
  selectedDate: Date,
  week: number,
  threshold: number,
  boundary: GeoJSON.Feature | GeoJSON.Geometry | undefined,
) {
  return useMemo(() => {
    if (!data || data.length === 0) return null;

    const filtered = data.filter((p) => {
      const dateField = p.timestamp || p.captured_at || p.created_at;
      if (!dateField) return true;

      const d = new Date(dateField);

      // Resets each Jan 1 of the selected year.
      if (d.getFullYear() !== selectedDate.getFullYear()) return false;

      const cutoff =
        week === 4
          ? new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59, 999)
          : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), week * 7, 23, 59, 59, 999);

      return d.getTime() <= cutoff.getTime();
    });

    if (filtered.length === 0) return null;

    // 2. Prepare Point Collection with Bounding Box Attributes
    const points = turf.featureCollection(
      filtered.map((p) => {
        const pointId = p.detection_id || p.image_id || p.id || Math.random().toString();
        const lat = Number(p.latitude);
        const lng = Number(p.longitude);
        return turf.point([lng, lat], {
          ...p,
          pointId,
          bbox_x1: p.bbox_x1 ?? p.x1 ?? 0,
          bbox_y1: p.bbox_y1 ?? p.y1 ?? 0,
          bbox_x2: p.bbox_x2 ?? p.x2 ?? 0,
          bbox_y2: p.bbox_y2 ?? p.y2 ?? 0,
          confidence_score: p.confidence_score ?? p.confidence ?? 0.85,
        });
      }),
    );

    // 3. Define Bounding Box & Cell Size (0.03km = 30m)
    const bbox = boundary ? turf.bbox(boundary as any) : turf.bbox(points);
    const cellSize = 0.03;

    const grid = turf.hexGrid(bbox, cellSize, { units: "kilometers" });

    // 4. Clip Grid to Drawn Area Polygon
    if (boundary) {
      grid.features = grid.features.filter((hex) => !turf.booleanDisjoint(hex, boundary as any));
    }

    // 5. Aggregate Point Properties into Hexbin
    let processedGrid = turf.collect(grid, points, "pointId", "pointIds");
    processedGrid = turf.collect(processedGrid, points, "image_url", "images");
    processedGrid = turf.collect(processedGrid, points, "waste_type", "types");
    processedGrid = turf.collect(processedGrid, points, "bbox_x1", "x1s");
    processedGrid = turf.collect(processedGrid, points, "bbox_y1", "y1s");
    processedGrid = turf.collect(processedGrid, points, "bbox_x2", "x2s");
    processedGrid = turf.collect(processedGrid, points, "bbox_y2", "y2s");
    processedGrid = turf.collect(processedGrid, points, "confidence_score", "confidence_scores");

    // 6. MICRO LEVEL: Compute Surface Area, Litter Density & CCI per Hex Cell
    const finalFeatures: Feature<Polygon, HexbinProperties>[] = [];

    processedGrid.features.forEach((hex) => {
      const pointIds = (hex.properties?.pointIds as string[]) || [];
      const itemCount = pointIds.length;

      if (itemCount < threshold) return;

      // Surface area of the specific cell in m²
      const hexAreaM2 = turf.area(hex);
      const litterDensity = hexAreaM2 > 0 ? itemCount / hexAreaM2 : 0;
      const cciValue = litterDensity * DRONE_K_FACTOR;
      const pollutionCategory = classifyCci(cciValue);

      hex.properties = {
        ...hex.properties,
        pointIds,
        hex_area_m2: hexAreaM2,
        litter_density: litterDensity,
        cci_value: cciValue,
        pollution_category: pollutionCategory,
      } as HexbinProperties;

      finalFeatures.push(hex as Feature<Polygon, HexbinProperties>);
    });

    return turf.featureCollection(finalFeatures);
  }, [week, threshold, selectedDate, data, boundary]);
}