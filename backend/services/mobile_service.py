import json
import uuid
import math
import logging
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, func, extract
from typing import List, Dict, Any
from models.image import Image
from models.detection import Detection


logger = logging.getLogger(__name__)

# Adaptive hex sizing (spec: algorithm_equations.md §2 — grid the SURVEY
# POLYGON, not the detections). Cell edge = min(bbox width, height) / 10 of
# the area boundary, clamped to sane bounds so a tiny drawn area can't
# explode the payload and a huge one can't produce four mega-cells.
# CCI is size-invariant (count / geodesic area), so per-area cell sizes never
# skew colors — area(h) is computed per cell server-side.
_HEX_EDGE_MIN_M = 25.0
_HEX_EDGE_MAX_M = 1000.0
_DEFAULT_EDGE_M = 150.0  # areas with no drawn boundary: keep the old fixed size
_M_PER_DEG_LAT = 110_574.0
_M_PER_DEG_LNG_EQUATOR = 111_320.0

# NOTE: within-window dedup is handled by the pipeline's own DBSCAN stages
# (A: overlapping frames ε=3 m, B: same-frame boxes ε≈2-3×GSD) — map counts
# are detection rows. Cross-flight (between-month) clustering was implemented
# and ROLLED BACK (product decision 2026-10: it undercounted too aggressively);
# the design is preserved in pipeline_explained.md §5 if it's ever revisited.

# Normalized survey boundary (spec polygon A). FIX (mixed-SRID InternalError):
# boundary polygons written before the srid=4326 column constraint exist with
# SRID 0, which poisons every downstream geometry op — the hex grid inherits
# SRID 0 from ST_Extent(boundary) and then ST_Contains(grid, 4326 point)
# raises "Operation on mixed SRID geometries". Normalize ONCE here: SRID 0 →
# tag as 4326 (WGS84 lat/lng — what the Leaflet area drawer emits; ST_SetSRID
# re-tags, it never transforms), any other declared SRID → transform to 4326.
_BOUNDARY_SELECT = """
    SELECT CASE
        WHEN ST_SRID(a.boundary_coordinates) = 0
            THEN ST_SetSRID(a.boundary_coordinates, 4326)
        ELSE ST_Transform(a.boundary_coordinates, 4326)
    END AS geom
    FROM areas a
    WHERE a.area_id = :area_id
"""

# Shared detection filter CTE — two window modes (product decision 2026-10):
#   month       = the selected month only, day cutoff = cumulative week
#                 (W2 = days 1-14, W4 = whole month) — the reporting view.
#   accumulated = Jan 1 → END of the selected month, same year. No week
#                 cutoff (clients hide the chips in this mode) — the
#                 carry-over/monitoring view: everything on record this year
#                 up to the picked month, so the map never blanks past the
#                 last flight month.
# Both modes pin :year (accumulated does NOT cross year boundaries).
_DETECTIONS_CTE = """
    filtered_detections AS (
        SELECT
            d.detection_id,
            ST_SetSRID(ST_MakePoint(d.longitude, d.latitude), 4326) as pt_geom
        FROM detections d
        WHERE d.area_id = :area_id
            AND d.latitude IS NOT NULL
            AND d.longitude IS NOT NULL
            AND EXTRACT(YEAR FROM d.timestamp) = :year
            AND (
                (:mode_month = true AND EXTRACT(MONTH FROM d.timestamp) = :month)
                OR (:mode_month = false AND EXTRACT(MONTH FROM d.timestamp) <= :month)
            )
            AND (:mode_month = false OR :day_upper IS NULL
                 OR EXTRACT(DAY FROM d.timestamp) <= :day_upper)
    )
"""


def _window_params(month: int, year: int, week: int, mode: str) -> dict:
    """Bind params for _DETECTIONS_CTE and the stats query."""
    return {
        "month": month,
        "year": year,
        # Week cutoff only exists in month mode (accumulated hides chips).
        "day_upper": None if (mode == "accumulated" or week >= 4) else week * 7,
        "mode_month": mode != "accumulated",
    }

class MobileMapService:
    @staticmethod
    def calculate_hex_tiles(
        db: Session,
        area_id: str,
        month: int,
        year: int,
        week: int,
        threshold: int,
        mode: str = "month",
    ) -> List[Dict[str, Any]]:
        """
        The Heavy Lifter Endpoint. Aggregates DETECTIONS (not frames) into
        hex cells entirely in the database layer to keep client payloads small.

        Shared by BOTH clients: mobile hits /mobile/map/areas/{id}/tiles and
        the web map hits /flights/areas/{id}/hexbins (perf fix: the web used
        to download every raw detection and turf-hexbin client-side).

        Adaptive grid (spec §2 CalculateLitterDensityMap): the grid covers the
        AREA's drawn boundary when it has one, and the cell edge derives from
        the boundary extent (min dimension / 10, clamped). Cells are CLIPPED
        to the boundary and hex_area_m2 is the geodesic area of the clipped
        cell — spec §2.4 (never trust planar hex formulas). Areas without a
        boundary fall back to the detections' bbox at the old fixed ~150 m
        size, so nothing crashes for un-mapped areas.

        FIX (empty-mobile-map bug): this used to aggregate the `images` table
        filtered by processing_status = 'done'. Only one image in the whole DB
        is 'done' (historical uploads failed before the pipeline fix), so the
        endpoint always returned [] while the web map (built on `detections`)
        showed hundreds of points. Detections only exist after successful
        inference, so no status gate is needed.
        """
        try:
            parsed_area_id = uuid.UUID(area_id)
        except ValueError:
            logger.error(f"Invalid UUID string passed to hex calculation: {area_id}")
            return []

        # Weeks are 1-4 within the month (week 4 = "rest of month"), matching
        # the web frontend's useHexbins cutoff semantics.
        day_upper = None if week == 4 else week * 7

        # Boundary extent decides the grid origin/size (spec: polygon A).
        # Same SRID normalization as the main query — extent is numeric so it
        # never raised, but one definition keeps size and grid consistent.
        extent_row = db.execute(text(f"""
            SELECT ST_XMin(e) AS minx, ST_YMin(e) AS miny,
                   ST_XMax(e) AS maxx, ST_YMax(e) AS maxy
            FROM (
                SELECT ST_Extent(b.geom) AS e
                FROM ({_BOUNDARY_SELECT}) b
            ) t
        """), {"area_id": parsed_area_id}).fetchone()

        has_boundary = extent_row is not None and extent_row.minx is not None

        if has_boundary:
            # Longitude degrees shrink with latitude — size the cell in real
            # meters at the boundary's mid-latitude, then convert back.
            lat_mid_rad = math.radians((extent_row.miny + extent_row.maxy) / 2)
            width_m = (extent_row.maxx - extent_row.minx) * _M_PER_DEG_LNG_EQUATOR * math.cos(lat_mid_rad)
            height_m = (extent_row.maxy - extent_row.miny) * _M_PER_DEG_LAT
            edge_m = min(width_m, height_m) / 10
            edge_m = max(_HEX_EDGE_MIN_M, min(edge_m, _HEX_EDGE_MAX_M))
        else:
            edge_m = _DEFAULT_EDGE_M
        hex_size_deg = edge_m / _M_PER_DEG_LNG_EQUATOR

        if has_boundary:
            # Grid over the boundary's extent; cells clipped to the polygon so
            # map edges show survey shape, not hex bleed. hex_area_m2 is the
            # CLIPPED geodesic area (a partial edge cell counts its real area,
            # which is what CCI needs). Empty intersections (detections just
            # outside the drawn polygon) come back without "coordinates" and
            # are dropped by the payload loop below.
            sql_executable = text(f"""
            WITH boundary AS (
                {_BOUNDARY_SELECT}
            ),
            {_DETECTIONS_CTE},
            grid AS (
                SELECT h.geom
                FROM (
                    -- ST_Extent returns box2d, which carries NO SRID — the
                    -- grid would inherit SRID 0 and ST_Contains against the
                    -- 4326 points would raise mixed-SRID. Re-tag explicitly
                    -- (same pattern as the no-boundary branch).
                    SELECT ST_SetSRID(ST_Extent(geom), 4326) AS bbox FROM boundary
                ) b,
                ST_HexagonGrid(:hex_size, b.bbox) h
            )
            SELECT
                COUNT(fi.detection_id) as cell_count,
                ARRAY_AGG(CAST(fi.detection_id AS TEXT)) as detection_ids,
                ST_AsGeoJSON(ST_Intersection(g.geom, (SELECT geom FROM boundary))) as hex_geojson,
                ST_Area(ST_Intersection(g.geom, (SELECT geom FROM boundary))::geography) as hex_area_m2
            FROM grid g
            JOIN filtered_detections fi ON ST_Contains(g.geom, fi.pt_geom)
            GROUP BY g.geom
            HAVING COUNT(fi.detection_id) >= :threshold
        """)
        else:
            # No drawn boundary: legacy behavior — grid over the detections'
            # own extent at the fixed default size, no clipping.
            sql_executable = text(f"""
            WITH {_DETECTIONS_CTE},
            grid AS (
                SELECT h.geom
                FROM (
                    SELECT ST_SetSRID(ST_Extent(pt_geom), 4326) as bbox FROM filtered_detections
                ) b,
                ST_HexagonGrid(:hex_size, b.bbox) h
            )
            SELECT
                COUNT(fi.detection_id) as cell_count,
                ARRAY_AGG(CAST(fi.detection_id AS TEXT)) as detection_ids,
                ST_AsGeoJSON(g.geom) as hex_geojson,
                ST_Area(g.geom::geography) as hex_area_m2
            FROM grid g
            JOIN filtered_detections fi ON ST_Contains(g.geom, fi.pt_geom)
            GROUP BY g.geom
            HAVING COUNT(fi.detection_id) >= :threshold
        """)

        try:
            results = db.execute(sql_executable, {
                "area_id": parsed_area_id,
                "hex_size": hex_size_deg,
                "threshold": threshold,
                **_window_params(month, year, week, mode),
            }).fetchall()

            payload = []
            for row in results:
                geo_data = json.loads(row.hex_geojson)

                if "coordinates" in geo_data:
                    coords = geo_data["coordinates"]
                    if isinstance(coords[0], list) and isinstance(coords[0][0], list):
                        raw_coords = coords[0]
                    else:
                        raw_coords = coords
                else:
                    # ST_Intersection produced an empty/singular geometry —
                    # the cell lies outside the drawn boundary. Skip it.
                    continue

                payload.append({
                    "polygon": raw_coords,
                    "detection_ids": row.detection_ids,
                    "count": row.cell_count,
                    # Geodesic cell area in m². Clients (web CCI math) use it
                    # directly instead of recomputing area locally.
                    "hex_area_m2": float(row.hex_area_m2) if row.hex_area_m2 is not None else None,
                })

            return payload

        except Exception as query_error:
            logger.error(f"Database Execution Exception in calculate_hex_tiles: {str(query_error)}")
            raise query_error

    @staticmethod
    def get_area_detection_stats(
        db: Session,
        area_id: str,
        month: int,
        year: int,
        week: int,
        mode: str = "month",
    ) -> Dict[str, Any]:
        """
        Cheap aggregates for the web map header, over the SAME detection
        filter as calculate_hex_tiles (month/year/cumulative week):
          - total: detection count (area-level CCI uses this)
          - latest: MAX(timestamp) so the UI can jump its date filter to the
            most recent flight data without downloading the collection.
        """
        try:
            parsed_area_id = uuid.UUID(area_id)
        except ValueError:
            return {"total": 0, "latest": None}

        filters = [
            Detection.area_id == parsed_area_id,
            Detection.latitude.isnot(None),
            Detection.longitude.isnot(None),
            # Same two-mode window as the hex tiles (per-month cumulative vs
            # Jan→selected-month accumulated), so header metrics can never
            # disagree with the map.
            extract("year", Detection.timestamp) == year,
            (
                (extract("month", Detection.timestamp) == month)
                if mode != "accumulated"
                else (extract("month", Detection.timestamp) <= month)
            ),
        ]
        if mode != "accumulated" and week < 4:
            filters.append(extract("day", Detection.timestamp) <= week * 7)

        total, latest = (
            db.query(func.count(Detection.detection_id), func.max(Detection.timestamp))
            .filter(*filters)
            .one()
        )
        return {
            "total": int(total or 0),
            "latest": latest.isoformat() if latest else None,
        }

    @staticmethod
    def fetch_batch_images(db: Session, image_ids: List[str]) -> List[Dict[str, Any]]:
        """
        Fetches full metadata along with mapped bounding box detections for a list of image UUIDs.
        Uses eager loading to avoid lazy loading empty relations.
        """
        if not image_ids:
            return []
            
        parsed_ids = [uuid.UUID(i_id) for i_id in image_ids]
        
        # 1. Eagerly load detections to prevent detached session issues
        images = db.query(Image).options(
            joinedload(Image.detections)
        ).filter(
            Image.image_id.in_(parsed_ids),
            # DB enum labels: 'done' (completed) / 'pending' — see
            # ProcessingStatus in models/image.py
            Image.processing_status.in_(['done', 'pending'])
        ).all()
        
        payload = []
        for img in images:
            detection_list = []
            for d in img.detections:
                # Map table columns to what the Flutter UI uses.
                # box_2d is [x1, y1, x2, y2] in ABSOLUTE original-image pixel
                # coordinates (ml/detect.py emits ultralytics' xyxy directly).
                # The app's BoundingBoxPainter scales these against the
                # decoded image's natural dimensions at render time, so no
                # normalization happens server-side.
                box_2d_array = [
                    float(d.bbox_x1),
                    float(d.bbox_y1),
                    float(d.bbox_x2),
                    float(d.bbox_y2),
                ]

                detection_list.append({
                    "label": d.waste_type,            # 'waste_type' column -> 'label'
                    "confidence": d.confidence_score,  # 'confidence_score' column -> 'confidence'
                    "box_2d": box_2d_array
                })

            # The drawer renders 'type' as the thumbnail badge. Use the
            # representative waste type (highest-confidence detection) instead
            # of the filename extension, which produced a literal "JPG" badge
            # on every thumbnail. None -> the app hides the badge.
            image_type = (
                max(img.detections, key=lambda d: d.confidence_score).waste_type
                if img.detections
                else None
            )

            payload.append({
                "image_id": str(img.image_id),
                "file_url": img.file_url,
                "latitude": img.latitude,
                "longitude": img.longitude,
                "captured_at": img.captured_at.isoformat() if img.captured_at else None,
                "type": image_type,
                # Original-frame pixel dimensions. Let the app scale bounding
                # boxes WITHOUT decoding the full-res image (mobile OOM guard);
                # null means legacy/unknown -> the app falls back to decoding.
                "image_width": img.image_width,
                "image_height": img.image_height,
                "detections": detection_list
            })
            
        return payload

    @staticmethod
    def fetch_batch_detections(db: Session, detection_ids: List[str]) -> List[Dict[str, Any]]:
        """
        Primary contract for the mobile drawer: resolve DETECTION ids to one
        payload item per detection, each carrying its source image's URL +
        dimensions so the app can render thumbnails and scale boxes correctly.
        """
        if not detection_ids:
            return []

        parsed_ids = [uuid.UUID(d_id) for d_id in detection_ids]

        # Eagerly load the source image alongside each detection.
        detections = db.query(Detection).options(
            joinedload(Detection.image)
        ).filter(
            Detection.detection_id.in_(parsed_ids)
        ).all()

        payload = []
        for d in detections:
            image_url = d.image_url or (d.image.file_url if d.image else None)

            payload.append({
                "detection_id": str(d.detection_id),
                "image_id": str(d.image_id) if d.image_id else None,
                "file_url": image_url,
                "latitude": d.latitude,
                "longitude": d.longitude,
                "captured_at": d.timestamp.isoformat() if d.timestamp else None,
                # Waste type IS the badge now - detections carry it directly.
                "type": d.waste_type,
                "image_width": d.image.image_width if d.image else None,
                "image_height": d.image.image_height if d.image else None,
                "detections": [
                    {
                        "label": d.waste_type,
                        "confidence": d.confidence_score,
                        "box_2d": [
                            float(d.bbox_x1),
                            float(d.bbox_y1),
                            float(d.bbox_x2),
                            float(d.bbox_y2),
                        ],
                    }
                ],
            })

        return payload
