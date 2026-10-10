from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db
from dependency import require_role, limiter
from slowapi import Limiter
from slowapi.util import get_remote_address
from models.drone_flight_log import DroneFlightLog
from models.image import Image, ProcessingStatus
from models.detection import Detection
from routes.helper.utils import FlightCreate, FlightResponse
from services.gps_service import extract_gps, extract_dimensions
from services.detection_service import process_image_upload
from services.dbscan_service import cluster_points
from services.mobile_service import MobileMapService
from dependency import require_public
from typing import Optional, List, Dict
from datetime import date
from sqlalchemy import extract
import uuid
import shutil
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# SECURITY: all flight endpoints require a valid JWT. Reads are guest-level
# (any logged-in user); upload-batch stays admin-gated by the web client's
# ProtectedRoute and is additionally rate-limited (each frame triggers YOLO
# inference + a Cloudinary upload — expensive per request).

# Directory where uploaded frames are staged before the background worker
# uploads them to Cloudinary. Cleaned up per-file by the worker.
TEMP_UPLOAD_DIR = "temp"


@router.post("/")
def create_flight(
    data: FlightCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_role("admin")),
):
    flight = DroneFlightLog(
        flight_date=data.flight_date,
        pilot_name=data.pilot_name,
        area_covered=data.area_covered,
        notes=data.notes,
        area_id=uuid.UUID(data.area_id) if data.area_id else None
    )
    db.add(flight)
    db.commit()
    db.refresh(flight)
    return flight

@router.get("/", response_model=list[FlightResponse])
def get_all_flights(
    db: Session = Depends(get_db),
    _user=Depends(require_role("guest")),
):
    return db.query(DroneFlightLog).order_by(
        DroneFlightLog.flight_date.desc()
    ).all()

@router.get("/areas/{area_id}/collection")
def get_area_image_collection(
    area_id: str,
    # Optional time window (FIX: pins used to ignore the map's date filter
    # entirely — 2025 pins stayed visible under a 2026 calendar). Omitting
    # the params keeps the old all-history behavior for existing callers;
    # the web map now sends the SAME window the hexbins use, so pins and
    # hexes always describe the same time slice.
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None),
    week: int = Query(4, ge=1, le=4),
    mode: str = Query("month", pattern="^(month|accumulated)$"),
    db: Session = Depends(get_db),
    # PUBLIC (web map pins logged-out via Open Forecast; mirrors the mobile
    # tiles endpoint's guard).
    _user=Depends(require_public()),
):
    try:
        area_uuid = uuid.UUID(area_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid area UUID format")

    query = db.query(Detection).filter(Detection.area_id == area_uuid)
    if year is not None and month is not None:
        query = query.filter(extract("year", Detection.timestamp) == year)
        if mode == "accumulated":
            # Jan 1 → end of selected month (same year), no week cutoff.
            query = query.filter(extract("month", Detection.timestamp) <= month)
        else:
            query = query.filter(extract("month", Detection.timestamp) == month)
            if week < 4:
                query = query.filter(extract("day", Detection.timestamp) <= week * 7)
    detections = query.all()

    return [
        {
            "detection_id": str(d.detection_id),
            "image_url": d.image_url,
            "waste_type": d.waste_type,

            "confidence_score": d.confidence_score,

            "latitude": d.latitude,
            "longitude": d.longitude,

            # Pass absolute pixel coordinates intact
            "bbox_x1": d.bbox_x1,
            "bbox_y1": d.bbox_y1,
            "bbox_x2": d.bbox_x2,
            "bbox_y2": d.bbox_y2,

            "timestamp": d.timestamp.isoformat() if d.timestamp else None,
            "captured_at": d.timestamp.isoformat() if d.timestamp else None,

            "image_id": str(d.image_id) if d.image_id else None,
            "file_url": d.image_url,
            "type": d.waste_type
        }
        for d in detections
    ]

@router.get("/areas/{area_id}/hexbins")
@limiter.limit("60/minute")
def get_area_hexbins(
    request: Request,
    area_id: str,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    week: int = Query(4, ge=1, le=4),
    threshold: int = Query(2, ge=1),
    mode: str = Query("month", pattern="^(month|accumulated)$"),
    db: Session = Depends(get_db),
    # PUBLIC (web map logged-out via Open Forecast; mirrors the mobile tiles
    # endpoint's guard).
    _user=Depends(require_public()),
):
    """
    Server-aggregated hexbins for the web map — the same PostGIS "Heavy
    Lifter" pipeline mobile uses, so the client never downloads the raw
    detection collection just to turf-hexbin it in the browser. Also returns
    cheap aggregates (total + latest detection timestamp) for the header
    metrics and the date-filter bootstrap.
    """
    try:
        area_uuid = uuid.UUID(area_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid area UUID format")

    area_key = str(area_uuid)
    try:
        tiles = MobileMapService.calculate_hex_tiles(
            db=db, area_id=area_key, month=month, year=year, week=week, threshold=threshold,
            mode=mode,
        )
        stats = MobileMapService.get_area_detection_stats(
            db=db, area_id=area_key, month=month, year=year, week=week, mode=mode,
        )
    except Exception:
        # Same opaque-500 contract as the mobile tiles route: log the full
        # traceback server-side, never leak SQL/geometry internals to the
        # client. An UNHANDLED 500 here bypasses CORSMiddleware entirely, so
        # the browser reports a misleading CORS failure instead of a server
        # error — containing it keeps CORS headers on the error response.
        logger.exception("Hexbin pipeline failed for area %s (mode=%s)", area_key, mode)
        raise HTTPException(status_code=500, detail="Internal server error while computing map tiles")
    return {
        "tiles": tiles,
        "total_detections": stats["total"],
        "latest_detection_at": stats["latest"],
    }

@router.post("/areas/{area_id}/images/batch")
def get_area_detection_batch(
    area_id: str,
    payload: Dict[str, List[str]],
    db: Session = Depends(get_db),
    # PUBLIC (product rule: guests browse the map fully — sector drawer
    # included). POST is only the transport for the id-list body; this is a
    # read-only id→payload resolution with no personal data. JWT bearer auth
    # (no cookies) means CSRF is not a concern for anonymous calls.
    _user=Depends(require_public()),
):
    """
    On-demand drawer details for the web map: resolves detection ids (from a
    clicked hexbin) into full records with image URL + bounding boxes. Keeps
    the hexbin payload small instead of embedding per-detection metadata.
    Mirrors POST /mobile/map/images/batch (same service behind both).
    """
    try:
        uuid.UUID(area_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid area UUID format")

    detection_ids = payload.get("detection_ids")
    if not detection_ids:
        return []
    try:
        return MobileMapService.fetch_batch_detections(db=db, detection_ids=detection_ids)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid detection id list")

@router.get("/{flight_id}")
def get_flight(
    flight_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role("guest")),
):
    flight = db.query(DroneFlightLog).filter(
        DroneFlightLog.flight_id == uuid.UUID(flight_id)
    ).first()

    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")

    return {
        "flight_details": flight,
        "images": flight.images
    }

@router.delete("/{flight_id}")
def delete_flight(
    flight_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_role("admin")),
):
    flight = db.query(DroneFlightLog).filter(
        DroneFlightLog.flight_id == uuid.UUID(flight_id)
    ).first()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    db.delete(flight)
    db.commit()
    return {"message": "Flight log deleted"}


def _save_upload_to_temp(file: UploadFile) -> str:
    """Persist an uploaded stream to disk so PIL/EXIF and YOLO can read it."""
    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
    path = os.path.join(TEMP_UPLOAD_DIR, f"{uuid.uuid4()}_{file.filename}")
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return path


def _cluster_frames(frames: list[dict]) -> list[dict]:
    """
    Stage A Frame-Level DBSCAN. Groups geotagged frames within eps=3m into
    clusters; frames without EXIF GPS become singleton clusters since they
    cannot be placed spatially.
    """
    geotagged = [f for f in frames if f["lat"] is not None and f["lng"] is not None]
    clusters = cluster_points(geotagged, eps_meters=3.0, min_samples=1) if geotagged else []

    for idx, frame in enumerate(frames):
        if frame["lat"] is None or frame["lng"] is None:
            clusters.append({
                "cluster_id": f"nogps_{idx}",
                "representative_point": {
                    "lat": None,
                    "lng": None,
                    "member_id": frame["id"],
                },
                "members": [frame],
                "member_count": 1,
            })
    return clusters


@router.post("/upload-batch")
@limiter.limit("10/minute")
async def upload_flight_batch(
    request: Request,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),

    area_id: Optional[str] = Form(None),
    flight_date: date = Form(...),
    pilot_name: str = Form(...),
    notes: str = Form(...),

    db: Session = Depends(get_db),
    _admin=Depends(require_role("admin")),
):
    """
    Stage A Frame-Level DBSCAN Implementation.
    Extracts GPS from each saved frame, clusters frames within eps=3m, marks
    non-representative duplicate frames, and enqueues the Stage B background
    pipeline ONLY for representative frames.
    """
    # One flight log per batch; every image in the batch references it.
    flight = DroneFlightLog(
        flight_date=flight_date,
        pilot_name=pilot_name,
        notes=notes,
        area_id=uuid.UUID(area_id) if area_id else None
    )
    db.add(flight)
    db.commit()
    db.refresh(flight)
    flight_id = str(flight.flight_id)

    # 1. Save streams to disk and read EXIF GPS from the file path.
    extracted_frames = []
    for file in files:
        temp_path = _save_upload_to_temp(file)
        lat, lng = extract_gps(temp_path)
        width, height = extract_dimensions(temp_path)
        extracted_frames.append({
            "id": str(uuid.uuid4()),
            "file": file,
            "temp_path": temp_path,
            "lat": lat,
            "lng": lng,
            "width": width,
            "height": height,
        })

    # 2. Stage A clustering across the batch.
    clustered_groups = _cluster_frames(extracted_frames)

    # 3. Persist Image rows; queue Stage B for representatives only.
    processed_images: list[Image] = []
    for cluster in clustered_groups:
        cluster_str_id = str(cluster["cluster_id"])
        rep_id = cluster["representative_point"]["member_id"]

        for member in cluster["members"]:
            is_rep = (member["id"] == rep_id)
            status = ProcessingStatus.PENDING if is_rep else ProcessingStatus.DUPLICATE_SKIPPED

            db_image = Image(
                image_id=uuid.UUID(member["id"]),
                flight_id=flight.flight_id,
                # Placeholder until the worker replaces it with the Cloudinary URL.
                file_url=f"pending/{flight_id}/{member['file'].filename}",
                asset_url=f"pending/{flight_id}/{member['file'].filename}",
                filename=member['file'].filename,
                latitude=member["lat"] if member["lat"] is not None else 0.0,
                longitude=member["lng"] if member["lng"] is not None else 0.0,
                image_width=member["width"],
                image_height=member["height"],
                is_representative=is_rep,
                cluster_id=cluster_str_id,
                processing_status=status
            )
            db.add(db_image)
            processed_images.append(db_image)

            if is_rep:
                background_tasks.add_task(
                    process_image_upload,
                    file_path=member["temp_path"],
                    flight_id=flight_id,
                    area_id=area_id,
                    filename=member['file'].filename,
                    lat=member["lat"],
                    lng=member["lng"],
                    image_id=str(db_image.image_id),
                )
    db.commit()

    return {
        "status": "success",
        "flight_id": flight_id,
        "pilot_name": pilot_name,
        "total_uploaded": len(files),
        "representatives_queued": len([img for img in processed_images if img.is_representative]),
        "duplicates_skipped": len([img for img in processed_images if not img.is_representative])
    }
