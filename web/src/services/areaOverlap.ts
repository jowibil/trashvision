import * as turf from "@turf/turf";
import type { Area } from "./hooks/useAreas";

// Mirrors the server's guard in POST /areas/create
// (backend/services/geo_assign.py find_overlapping_areas) so the admin sees the
// conflict BEFORE the round-trip. The server stays the authority — a stale
// cached area list still gets a 409, which the drawer renders too.
//
// Shared EDGES are allowed (neighbouring jurisdictions touch); only shared
// INTERIOR ground is a conflict, because point assignment keeps the lowest
// area_id — the other area silently loses the overlap, which shows up later as
// a hole in its hex map and an undercounted CCI.

type ArealGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

/** Existing areas whose boundary covers the same interior ground as `drawn`. */
export function findOverlappingAreas(
  drawn: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
  areas: Area[],
): Area[] {
  const drawnAreal = asAreal(drawn);
  if (!drawnAreal) return [];

  const drawnFeature = turf.feature(drawnAreal);
  const [dMinX, dMinY, dMaxX, dMaxY] = turf.bbox(drawnFeature);

  return areas.filter((area) => {
    const existingAreal = asAreal(area.boundary);
    if (!existingAreal) return false;

    const existingFeature = turf.feature(existingAreal);
    // Bounding boxes first: most areas are nowhere near the draw, and the
    // polygon clip below is the expensive part.
    const [aMinX, aMinY, aMaxX, aMaxY] = turf.bbox(existingFeature);
    if (aMaxX < dMinX || aMinX > dMaxX || aMaxY < dMinY || aMinY > dMaxY) {
      return false;
    }

    const shared = turf.intersect(
      turf.featureCollection([existingFeature, drawnFeature]),
    );
    // No intersection at all, or only a shared edge/corner (a LineString or
    // Point comes back) — both fine. Anything with area is real overlap,
    // including an exact copy of the existing outline.
    return shared !== null && hasArea(shared.geometry);
  });
}

function asAreal(
  source: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
): ArealGeometry | null {
  if (!source) return null;
  const geometry = source.type === "Feature" ? source.geometry : source;
  if (!geometry) return null;
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon"
    ? geometry
    : null;
}

function hasArea(geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return true;
  }
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.some(hasArea);
  }
  return false;
}
