/**
 * ZoneMapPreview — a small, non-interactive map of a hotspot zone rendered
 * with the same OSM tile source MapView/ReportDetailModal use, showing the
 * zone's real boundary (or falling back to its centroid when the boundary
 * geometry is unusable).
 *
 * REVERT OPTIONS (critique 2026-11-01, P1 "placeholder zone imagery"):
 * the user asked for real zone imagery with a documented way back. To
 * return to an earlier treatment, replace the <ZoneMapPreview /> call in
 * Dashboard.tsx's hotspot card with either of:
 *   1. Static placeholder plate:
 *      <img src={placeholder} alt={zone.name}
 *           className="w-full h-full object-cover opacity-90" />
 *      importing `import placeholder from "@/assets/herobg.png";`
 *      (asset still exists at web/src/assets/herobg.png).
 *   2. Text-only zone card: drop the image plate entirely and let the
 *      name/severity/date stack fill the card.
 */

import { memo, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import * as turf from "@turf/turf";
import type { Area } from "../../services/hooks/useAreas";

// Same free OSM raster tile source as MapView / ReportDetailModal — one
// imagery contract across the portal; no tile-provider keys involved.
const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// A zero-area bbox (point-only or degenerate geometry) would ask Leaflet to
// zoom "into" a single coordinate — fall back to the centroid instead.
const MIN_BBOX_SPAN = 1e-8;
// When fitBounds is unavailable (no boundary), the centroid map shows
// district-scale context rather than a blank zoom.
const FALLBACK_ZOOM = 15;

function ZoneMapPreview({ area }: { area?: Area }) {
  // GeoJSON bbox order is [west, south, east, north]; Leaflet bounds take
  // [[south, west], [north, east]] lat-lng pairs. Compute once per area.
  const bounds = useMemo<[number, number][] | null>(() => {
    const geojson = area?.boundary;
    if (!geojson) return null;
    try {
      // turf.bbox returns [west, south, east, north] (GeoJSON order); the
      // Leaflet bounds shape is built below from that.
      const [minX, minY, maxX, maxY] = turf.bbox(geojson);
      if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
      if (maxX - minX < MIN_BBOX_SPAN && maxY - minY < MIN_BBOX_SPAN) return null;
      return [
        [minY, minX],
        [maxY, maxX],
      ];
    } catch {
      return null;
    }
  }, [area]);

  // Areas come from useAreas(), which loads async (and from cache when
  // offline) — the loading state keeps the card plate from collapsing.
  if (!area) {
    return (
      <div className="h-full w-full bg-slate-100 flex items-center justify-center">
        <MapPin size={28} className="text-slate-300" aria-hidden="true" />
      </div>
    );
  }

  return (
    <MapContainer
      key={area.area_id}
      bounds={bounds ?? undefined}
      center={
        bounds ? undefined : [area.center_latitude, area.center_longitude]
      }
      zoom={bounds ? undefined : FALLBACK_ZOOM}
      maxZoom={18}
      className="h-full w-full"
      // Purely a preview plate: all interaction lives in the actual map page,
      // and disabling the controls keeps tile dragging from fighting the
      // card grid's scroll gesture on touch screens.
      dragging={false}
      touchZoom={false}
      doubleClickZoom={false}
      scrollWheelZoom={false}
      boxZoom={false}
      keyboard={false}
      zoomControl={false}
      attributionControl={true}
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      {area.boundary ? (
        <GeoJSON
          key={`boundary-${area.area_id}`}
          data={area.boundary}
          interactive={false}
          pathOptions={{
            color: "#005D90",
            weight: 1.75,
            fillColor: "#005D90",
            fillOpacity: 0.08,
          }}
        />
      ) : null}
    </MapContainer>
  );
}

export default memo(ZoneMapPreview);
