"""Point-to-area resolution shared by report submission and flight uploads.

Both POST /reports/ (community reports) and POST /flights/upload-batch (drone
frames carrying EXIF GPS) need the same primitive: "which drawn area polygon
covers this lat/lng?" The auto-detect is best-effort and HONEST — if no
boundary matches, the caller keeps area_id NULL ("unassigned") rather than
guessing a nearest area (see the 2026-10-14 discussion; surfaced in the UI as
"Unassigned sector" / no report pin).
"""

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
