// web/src/services/hooks/useHexbins.ts
import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import type { HexbinProperties, PollutionCategory } from "../../types/types";

// The five CCI bands as the map legend renders them — exported for the Info
// page (and any other consumer) so a legend elsewhere is never a re-typed
// copy. Labels/thresholds mirror classifyCci; colors via getCciColor.
export const CCI_LEGEND_ITEMS = [
  { label: "Very low", category: "Very low", desc: "≤ 2" },
  { label: "Low", category: "Low", desc: "2 - 5" },
  { label: "Moderate", category: "Moderate", desc: "5 - 10" },
  { label: "High", category: "High", desc: "10 - 20" },
  { label: "Very high", category: "Very high", desc: "> 20" },
] as const;

/** Cell fill color per CCI band — the exact colors both maps paint with
 *  (web MapView hex polygons + phone getCciColor). Kept in this shared
 *  service module so pages/components don't import MapView for it. */
export const getCciColor = (category?: PollutionCategory | string): string => {
  switch (category) {
    case "Very low":
      return "#10b981"; // Em Green
    case "Low":
      return "#3b82f6"; // Blue
    case "Moderate":
      return "#f59e0b"; // Yellow
    case "High":
      return "#f97316"; // Orange
    case "Very high":
      return "#ef4444"; // Red
    default:
      return "#94a3b8"; // Slate Gray
  }
};
import type { HexbinTile } from "./useAreaHexbins";

// CCI scaling coefficient — spec value (algorithm_equations.md §2.1:
// "typically K = 20"). Same constant the area header metric uses, so cells
// and the survey-wide chip are on ONE scale. CCI is size-invariant, so the
// adaptive per-area cell sizes never skew colors.
export const DRONE_K_FACTOR = 20;

// Fallback area (m²) of a regular hexagon with 0.0015° edges, used only if
// the server couldn't compute ST_Area(geography). Matches the equator case;
// real values vary a few % with latitude.
const FALLBACK_HEX_AREA_M2 = 72_438;

export function classifyCci(cciValue: number): PollutionCategory {
  if (cciValue <= 2) return "Very low";
  if (cciValue <= 5) return "Low";
  if (cciValue <= 10) return "Moderate";
  if (cciValue <= 20) return "High";
  return "Very high";
}

/**
 * Perf (Heavy Lifter migration): converts server hexbin tiles (PostGIS
 * ST_HexagonGrid with a 0.0015° edge — the same geometry the old
 * turf.hexGrid(0.03 km) produced) into a Leaflet-ready FeatureCollection.
 * Replaces the removed client-side turf binning; CCI is computed per cell
 * from the server-provided geodesic area so colors are unchanged.
 */
export function hexbinTilesToFeatureCollection(
  tiles: HexbinTile[],
  boundary: GeoJSON.Feature | GeoJSON.Geometry | undefined,
) {
  const features: Feature<Polygon, HexbinProperties>[] = [];

  if (!tiles || tiles.length === 0) return turf.featureCollection(features);

  for (const tile of tiles) {
    const ring: [number, number][] = tile.polygon.map(([x, y]) => [x, y]);
    if (ring.length < 3) continue;

    // Close the ring if the backend didn't (turf requires it).
    const [x0, y0] = ring[0];
    const [xn, yn] = ring[ring.length - 1];
    if (x0 !== xn || y0 !== yn) ring.push([x0, y0]);

    const hex = turf.polygon([ring]);

    // Keep grid clipped to the drawn area polygon (same as before).
    if (boundary && turf.booleanDisjoint(hex, boundary as any)) continue;

    const pointIds = tile.detection_ids || [];
    const hexAreaM2 =
      tile.hex_area_m2 && tile.hex_area_m2 > 0
        ? tile.hex_area_m2
        : FALLBACK_HEX_AREA_M2;
    const litterDensity = hexAreaM2 > 0 ? pointIds.length / hexAreaM2 : 0;
    const cciValue = litterDensity * DRONE_K_FACTOR;

    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: {
        pointIds,
        type_counts: tile.type_counts
          ? Object.fromEntries(
              Object.entries(tile.type_counts).map(([k, v]) => [k, Number(v)]),
            )
          : undefined,
        hex_area_m2: hexAreaM2,
        litter_density: litterDensity,
        cci_value: cciValue,
        pollution_category: classifyCci(cciValue),
      },
    });
  }

  return turf.featureCollection(features);
}