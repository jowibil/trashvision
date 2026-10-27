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
from services.gps_service import extract_gps, extract_dimensions, extract_capture_date
from services.geo_assign import resolve_area_for_point
from services.detection_service import process_image_upload
from services.dbscan_service import cluster_points, STAGE_A_EPS_METERS, DBSCAN_MIN_SAMPLES
from services.mobile_service import MobileMapService
from dependency import require_public
from typing import Optional, List, Dict
from datetime import date, datetime
from sqlalchemy import extract
import uuid
import shutil
import hashlib
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


def _save_upload_to_temp(file: UploadFile) -> tuple[str, str]:
    """Persist an uploaded stream to disk so PIL/EXIF and YOLO can read it.

    The SHA-256 of the raw bytes is computed while the stream is written
    (single pass over the multipart body) so callers can dedup re-uploads
    before Stage B ever touches the frame. Returns (temp_path, sha256_hex).
    """
    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
    path = os.path.join(TEMP_UPLOAD_DIR, f"{uuid.uuid4()}_{file.filename}")
    hasher = hashlib.sha256()
    with open(path, "wb") as buffer:
        while chunk := file.file.read(8192):
            hasher.update(chunk)
            buffer.write(chunk)
    return path, hasher.hexdigest()


def _cluster_frames(frames: list[dict]) -> list[dict]:
    """
    Stage A Frame-Level DBSCAN. Groups geotagged frames within eps=3m into
    clusters; frames without EXIF GPS become singleton clusters since they
    cannot be placed spatially.
    """
    geotagged = [f for f in frames if f["lat"] is not None and f["lng"] is not None]
    clusters = (
        cluster_points(geotagged, eps_meters=STAGE_A_EPS_METERS, min_samples=DBSCAN_MIN_SAMPLES)
        if geotagged
        else []
    )

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

    # 1. Save streams to disk (hashing on the fly) and read EXIF GPS from
    # the file path.
    extracted_frames = []
    for file in files:
        temp_path, content_hash = _save_upload_to_temp(file)
        lat, lng = extract_gps(temp_path)
        width, height = extract_dimensions(temp_path)
        # Upload-aid only — see extract_capture_date's docstring: the stored
        # captured_at stays flight-date driven; this feeds a mismatch
        # warning to the admin.
        exif_date = extract_capture_date(temp_path)
        extracted_frames.append({
            "id": str(uuid.uuid4()),
            "file": file,
            "temp_path": temp_path,
            "content_hash": content_hash,
            "lat": lat,
            "lng": lng,
            "width": width,
            "height": height,
            "exif_date": exif_date,
        })

    # 1a. Auto-detect assignment area (Upload page "Auto-detect from GPS").
    # The frontend omits area_id for "auto", which used to commit the flight
    # with area_id NULL and let TrashLogs show "Unassigned sector" — despite
    # every frame carrying EXIF GPS. Resolve the covering area per frame and
    # pick the majority. Manual selection always wins when given; if no
    # boundary covers any GPS point, stay UNASSIGNED (honest, surfaces
    # boundary gaps) rather than guessing the nearest area.
    if area_id is None:
        tally: dict = {}
        for frame in extracted_frames:
            resolved_area = resolve_area_for_point(db, frame["lat"], frame["lng"])
            if resolved_area is not None:
                tally[resolved_area] = tally.get(resolved_area, 0) + 1
        if tally:
            detected_area = max(
                tally.items(),
                key=lambda item: (item[1], str(item[0].area_id)),  # count, then deterministic tie-break
            )[0]
            area_id = str(detected_area.area_id)
            # The flight row was already committed with NULL above; update it
            # in place so TrashLogs/hexbin routes see the real assignment.
            flight.area_id = detected_area.area_id
            db.add(flight)
            db.commit()
            logger.info(
                "Auto-detected area %s for flight %s (from %d/%d GPS frames)",
                detected_area.area_name,
                flight_id,
                tally[detected_area],
                len(files),
            )

    # 1b. Content-hash dedup (Stage 0). A frame whose bytes already exist in
    # a past flight — or earlier in this same batch — is pulled out BEFORE
    # Stage A clustering so it never re-triggers YOLO inference + Cloudinary
    # upload. It still gets an Image row (audit trail) but no background
    # task; its temp file is deleted here since the worker, which normally
    # cleans up, is never enqueued for it. Legacy rows have NULL hashes and
    # NULL never equals NULL, so they are never skipped.
    batch_hashes = [f["content_hash"] for f in extracted_frames]
    existing_hashes = {
        h for (h,) in db.query(Image.content_hash).filter(
            Image.content_hash.in_(batch_hashes)
        ).all()
        if h is not None
    }
    already_uploaded_frames = []
    fresh_frames = []
    seen_hashes = set()
    for frame in extracted_frames:
        if frame["content_hash"] in existing_hashes or frame["content_hash"] in seen_hashes:
            already_uploaded_frames.append(frame)
        else:
            seen_hashes.add(frame["content_hash"])
            fresh_frames.append(frame)

    if already_uploaded_frames:
        logger.info(
            "Content-hash dedup skipped %d of %d frames for flight %s",
            len(already_uploaded_frames), len(files), flight_id,
        )

    # 2. Stage A clustering across the de-duplicated batch.
    clustered_groups = _cluster_frames(fresh_frames)

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
                content_hash=member["content_hash"],
                # From the admin-entered flight date (captured_at feeds
                # batch-image listings); the insert clock would misdate
                # historical flights.
                captured_at=datetime.combine(flight.flight_date, datetime.min.time()),
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
            else:
                # Stage A duplicate: no worker is enqueued for this frame, so
                # its temp file would leak to disk forever. The worker's
                # finally-block is what normally frees the file.
                if os.path.exists(member["temp_path"]):
                    os.remove(member["temp_path"])

    # 3b. Persist audit rows for already-uploaded frames and free their temp
    # files (no background worker will ever clean these up). cluster_id stays
    # NULL: these frames never entered this batch's Stage A clustering.
    for frame in already_uploaded_frames:
        db.add(Image(
            image_id=uuid.UUID(frame["id"]),
            flight_id=flight.flight_id,
            file_url=f"pending/{flight_id}/{frame['file'].filename}",
            asset_url=f"pending/{flight_id}/{frame['file'].filename}",
            filename=frame['file'].filename,
            latitude=frame["lat"] if frame["lat"] is not None else 0.0,
            longitude=frame["lng"] if frame["lng"] is not None else 0.0,
            image_width=frame["width"],
            image_height=frame["height"],
            content_hash=frame["content_hash"],
            captured_at=datetime.combine(flight.flight_date, datetime.min.time()),
            is_representative=False,
            cluster_id=None,
            processing_status=ProcessingStatus.DUPLICATE_SKIPPED
        ))
        if os.path.exists(frame["temp_path"]):
            os.remove(frame["temp_path"])
    db.commit()

    # EXIF-date aid summary (additive response fields; aid only, see
    # extract_capture_date). Distinct EXIF capture dates -> frame count, so
    # the admin can see when a typed flight date disagrees with what the
    # camera actually wrote.
    exif_date_counts: dict[str, int] = {}
    for frame in extracted_frames:
        exif_date = frame.get("exif_date")
        if exif_date:
            exif_date_counts[exif_date] = exif_date_counts.get(exif_date, 0) + 1
    flight_date_str = str(flight.flight_date)
    exif_date_mismatch_count = sum(
        count for exif_date, count in exif_date_counts.items()
        if exif_date != flight_date_str
    )

    return {
        "status": "success",
        "flight_id": flight_id,
        "pilot_name": pilot_name,
        "flight_date": flight_date_str,
        "total_uploaded": len(files),
        "representatives_queued": len([img for img in processed_images if img.is_representative]),
        "duplicates_skipped": len([img for img in processed_images if not img.is_representative]),
        "already_uploaded": len(already_uploaded_frames),
        "exif_capture_dates": exif_date_counts,
        "exif_date_mismatch_count": exif_date_mismatch_count,
    }
