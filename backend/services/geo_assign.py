"""Point-to-area resolution shared by report submission and flight uploads.

Both POST /reports/ (community reports) and POST /flights/upload-batch (drone
frames carrying EXIF GPS) need the same primitive: "which drawn area polygon
covers this lat/lng?" The auto-detect is best-effort and HONEST — if no
boundary matches, the caller keeps area_id NULL ("unassigned") rather than
guessing a nearest area (see the 2026-10-14 discussion; surfaced in the UI as
"Unassigned sector" / no report pin).
"""

import json
import uuid

from sqlalchemy.orm import Session
from sqlalchemy import text

from models.area import Area


def resolve_area_for_point(db: Session, lat: float | None, lng: float | None) -> Area | None:
    """Return the first Area whose boundary polygon covers the point, or None.

    - lat/lng must be real EXIF GPS values (None or the pipeline's 0.0
      placeholder from EXIF-less frames never match a boundary).
    - Deterministic on the open-boundary edge case: ordering by area_id.
    - Cheap: one indexed-enough spatial scan per point; callers fetching many
      points should batch by calling this per point only for distinct coords.
    """
    if lat is None or lng is None or (lat == 0.0 and lng == 0.0):
        return None

    row = db.execute(
        text(
            """
            SELECT a.area_id, ST_Covers(a.boundary_coordinates,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)) AS covered
            FROM areas a
            WHERE a.boundary_coordinates IS NOT NULL
              AND ST_Covers(a.boundary_coordinates,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
            ORDER BY a.area_id
            LIMIT 1
            """
        ),
        {"lat": float(lat), "lng": float(lng)},
    ).first()

    if row is None:
        return None
    return db.get(Area, row.area_id)


def resolve_areas_for_points(
    db: Session, points: list[tuple[float | None, float | None]]
) -> dict[int, uuid.UUID]:
    """Resolve MANY points in ONE spatial query: {point index -> area_id}.

    Per-point semantics are identical to resolve_area_for_point: None / (0, 0)
    placeholders never match, and the lowest area_id wins where polygons
    overlap. The difference is cost — the upload path used to run one PostGIS
    scan per frame in a loop (200 sequential round-trips for a 200-frame
    mission), inside the only worker.

    Uncovered points are absent from the result rather than mapped to a
    nearest area: callers keep their own "unassigned" honesty.
    """
    indexed = [
        (idx, float(lat), float(lng))
        for idx, (lat, lng) in enumerate(points)
        if lat is not None and lng is not None and not (lat == 0.0 and lng == 0.0)
    ]
    if not indexed:
        return {}

    rows = db.execute(
        text(
            """
            WITH pts AS (
                SELECT *
                FROM unnest(
                    CAST(:idxs AS int[]),
                    CAST(:lats AS float8[]),
                    CAST(:lngs AS float8[])
                ) AS t(idx, lat, lng)
            )
            -- min(...::text): uuid has no min() aggregate on every supported
            -- Postgres, and canonical uuid text sorts in byte order anyway.
            SELECT pts.idx AS idx, min(a.area_id::text) AS area_id
            FROM pts
            JOIN areas a
              ON a.boundary_coordinates IS NOT NULL
             AND ST_Covers(a.boundary_coordinates,
                    ST_SetSRID(ST_MakePoint(pts.lng, pts.lat), 4326))
            GROUP BY pts.idx
            """
        ),
        {
            "idxs": [row[0] for row in indexed],
            "lats": [row[1] for row in indexed],
            "lngs": [row[2] for row in indexed],
        },
    ).all()

    return {row.idx: uuid.UUID(row.area_id) for row in rows}


# Existing boundaries predating the srid=4326 column constraint exist with
# SRID 0, so a spatial predicate against them needs the same normalization
# insights_service._area_size_expr applies before the ::geography cast.
_AREA_GEOM_SQL = (
    "CASE WHEN ST_SRID(boundary_coordinates) = 0 "
    "THEN ST_SetSRID(boundary_coordinates, 4326) "
    "ELSE ST_Transform(boundary_coordinates, 4326) END"
)


def find_overlapping_areas(db: Session, geojson: dict) -> list[str]:
    """Names of existing areas sharing INTERIOR ground with this boundary.

    The draw endpoint's guard rail. Two boundaries over the same ground make
    point assignment arbitrary (resolve_area_for_point keeps the lowest
    area_id), so the losing area's hex map shows a hole in the shared region
    and its CCI/alert undercounts — silently, with nothing on screen to say
    two areas claim the same ground. Creation is the only moment an admin can
    still be told, so the save is refused instead.

    Shared EDGES are not a conflict: neighbouring jurisdictions legitimately
    touch, and a shared border is harmless (each interior point still resolves
    to exactly one area). Overlap, containment in either direction and an
    exact copy of an existing outline all count.

    Empty list = clear to save.
    """
    rows = db.execute(
        text(
            f"""
            WITH drawn AS (
                SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326) AS geom
            )
            SELECT a.area_name
            FROM areas a
            CROSS JOIN drawn g
            WHERE a.boundary_coordinates IS NOT NULL
              AND (
                    ST_Overlaps({_AREA_GEOM_SQL}, g.geom)
                 OR ST_Contains({_AREA_GEOM_SQL}, g.geom)
                 OR ST_Contains(g.geom, {_AREA_GEOM_SQL})
              )
            ORDER BY a.area_name
            """
        ),
        {"geojson": json.dumps(geojson)},
    ).all()
    return [row.area_name for row in rows]
