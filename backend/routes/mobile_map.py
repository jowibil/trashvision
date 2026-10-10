from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from database import get_db
from dependency import require_role, require_public, limiter
from models.area import Area
from routes.helper.utils import ReportPublic
from services.mobile_service import MobileMapService 
from shapely.geometry import mapping
from geoalchemy2.shape import to_shape
from typing import Optional, List, Dict
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: reads below are PUBLIC (product decision 2026-10 — the web portal
# browses the map logged-out via "Open Forecast"; mobile always sends its JWT
# anyway, and valid tokens still resolve their role as before). The batch
# endpoint is public too (product rule: guests see sector drawer images):
# POST is only the transport for the id-list body — it is a read-only
# id→payload resolution, no personal data, and JWT bearer auth (no cookies)
# means CSRF is not a concern for anonymous calls.


@router.get("/areas")
def get_mobile_areas(
    db: Session = Depends(get_db),
    _user=Depends(require_public()),
):
    """All areas with boundary GeoJSON — for rendering polygons in flutter_map"""
    areas = db.query(Area).all()
    return [
        {
            "area_id": str(a.area_id),
            "area_name": a.area_name,
            "center_latitude": a.center_latitude,
            "center_longitude": a.center_longitude,
            "boundary": mapping(to_shape(a.boundary_coordinates)) if a.boundary_coordinates else None,
        }
        for a in areas
    ]


# ─── New Heavy Lifter Map Dynamic Tiles Endpoint ────────────────────────────
# Rate-limited: the PostGIS hexbin aggregation is the most expensive read
# query in the API (full detections scan + ST_HexagonGrid per request).
# 60/min comfortably covers the debounced slider + pan interactions.
@router.get("/areas/{area_id}/tiles")
@limiter.limit("60/minute")
def get_mobile_area_tiles(
    request: Request,
    area_id: str,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    week: int = Query(4, ge=1, le=4),
    threshold: int = Query(2, ge=1),
    mode: str = Query("month", pattern="^(month|accumulated)$"),
    db: Session = Depends(get_db),
    _user=Depends(require_public()),
):
    """
    The Heavy Lifter Endpoint. Offloads dynamic grouping calculations 
    to the database layer to dramatically optimize mobile payload sizing.
    """
    try:
        return MobileMapService.calculate_hex_tiles(
            db=db,
            area_id=area_id,
            month=month,
            year=year,
            week=week,
            threshold=threshold,
            mode=mode,
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID Format configuration context")
    except Exception:
        # Log the full traceback server-side; return an opaque 500 so internal
        # details (SQL, table names) never reach the client.
        logger.exception("Hex-bin pipeline failed for area %s", area_id)
        raise HTTPException(status_code=500, detail="Internal server error while computing map tiles")


# ─── New On-Demand High-Zoom Batch Metadata Endpoint ───────────────────────
@router.post("/images/batch")
def get_mobile_batch_images(
    payload: Dict[str, List[str]],
    db: Session = Depends(get_db),
    _user=Depends(require_public()),
):
    """
    On-demand collection resolution loader. Fetches complete file asset blocks
    only when a targeted coordinate cell ring is activated on-screen.

    Accepts `detection_ids` (current contract — the hex tiles now aggregate
    detections) or falls back to legacy `image_ids` for older APK builds.
    """
    detection_ids = payload.get("detection_ids")
    image_ids = payload.get("image_ids", [])
    try:
        if detection_ids is not None:
            return MobileMapService.fetch_batch_detections(db=db, detection_ids=detection_ids)
        return MobileMapService.fetch_batch_images(db=db, image_ids=image_ids)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tracking identification UUID array lists")