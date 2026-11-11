from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db
from dependency import require_role, limiter
from slowapi import Limiter
from slowapi.util import get_remote_address
from models.drone_flight_log import DroneFlightLog
from models.image import Image, ProcessingStatus
from models.detection import Detection
from routes.helper.utils import FlightCreate, FlightResponse, FlightStats
from services.gps_service import (
    extract_gps,
    extract_dimensions,
    extract_capture_date,
    extract_capture_datetime,
)
from services.geo_assign import resolve_areas_for_points
from services.detection_service import process_image_upload
from services.dbscan_service import cluster_points, STAGE_A_EPS_METERS, DBSCAN_MIN_SAMPLES
from services.mobile_service import MobileMapService
from dependency import require_public
from typing import Optional, List, Dict
from datetime import date, datetime, timezone
from sqlalchemy import extract, func
import uuid
import shutil
import hashlib
import os
import time
import asyncio
import logging

from starlette.concurrency import run_in_threadpool

from config import settings
from models.area import Area

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
    # The images array is thousands of rows and the only optional part of this
    # payload; the stats block is seven scalars and always returned (a flag
    # would mean two payload shapes for no saved bytes).
    include_images: bool = Query(True),
    db: Session = Depends(get_db),
    _user=Depends(require_role("guest")),
):
    """Flight detail + what the pipeline did with what was sent.

    `stats` is the reason this route exists after an upload: the upload
    response describes the REQUEST (and is gone after a reload), while
    BackgroundTasks leave nothing behind when the process is replaced. These
    counters are read from the rows themselves, so they survive both.

    `last_capture_at` is the newest frame's EXIF shutter time — a label for the
    mission, never proof of activity.
    """
    try:
        flight_uuid = uuid.UUID(flight_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid flight UUID format")

    flight = db.query(DroneFlightLog).filter(
        DroneFlightLog.flight_id == flight_uuid
    ).first()

    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")

    # One aggregate row over one flight: COUNT(*) FILTER per status instead of
    # loading the images to count them in Python.
    counts = db.query(
        func.count(Image.image_id).label("images_total"),
        func.count(Image.image_id).filter(
            Image.processing_status == ProcessingStatus.COMPLETED
        ).label("images_done"),
        # `processing` is currently unreachable, but folding it in means a
        # future worker cannot make a held frame report as finished.
        func.count(Image.image_id).filter(
            Image.processing_status.in_(
                [ProcessingStatus.PENDING, ProcessingStatus.PROCESSING]
            )
        ).label("images_pending"),
        func.count(Image.image_id).filter(
            Image.processing_status == ProcessingStatus.DUPLICATE_SKIPPED
        ).label("images_skipped"),
        func.count(Image.image_id).filter(
            Image.processing_status == ProcessingStatus.FAILED
        ).label("images_failed"),
        func.max(Image.captured_at).label("last_capture_at"),
    ).filter(Image.flight_id == flight_uuid).one()

    detections_total = db.query(func.count(Detection.detection_id)).filter(
        Detection.flight_id == flight_uuid
    ).scalar() or 0

    payload = {
        "flight_details": flight,
        "stats": FlightStats(
            images_total=counts.images_total or 0,
            images_done=counts.images_done or 0,
            images_pending=counts.images_pending or 0,
            images_skipped=counts.images_skipped or 0,
            images_failed=counts.images_failed or 0,
            detections_total=detections_total,
            last_capture_at=counts.last_capture_at,
        ),
    }
    if include_images:
        payload["images"] = flight.images
    return payload

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


class UploadRejected(Exception):
    """Rejection raised inside the threadpool extraction pass.

    That pass has no request context to raise HTTPException into, so it raises
    this and the endpoint maps it to the typed response below.
    """

    def __init__(self, status_code: int, detail: dict):
        super().__init__(detail.get("message", "upload rejected"))
        self.status_code = status_code
        self.detail = detail


def _cap_detail(error: str, message: str, **extra) -> dict:
    """The typed rejection body the upload form is meant to render."""
    return {"error": error, "message": message, **extra}


def _cap_error(error: str, message: str, **extra) -> HTTPException:
    return HTTPException(status_code=413, detail=_cap_detail(error, message, **extra))


_upload_semaphore: asyncio.Semaphore | None = None


def _upload_gate() -> asyncio.Semaphore:
    """Single-flight save loop (settings.MAX_CONCURRENT_UPLOADS).

    Built lazily so importing the router never needs a running event loop.
    """
    global _upload_semaphore
    if _upload_semaphore is None:
        _upload_semaphore = asyncio.Semaphore(max(1, settings.MAX_CONCURRENT_UPLOADS))
    return _upload_semaphore


def _ensure_temp_capacity(declared_bytes: int | None) -> None:
    """Refuse before writing when the temp volume cannot hold the request.

    Self-defence, not policy: there is no reaper for temp files left behind by
    a killed worker, so a full disk otherwise surfaces as an untyped OSError
    in the middle of the save loop, after the flight row already exists.
    """
    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
    expected = declared_bytes if declared_bytes and declared_bytes > 0 else settings.MAX_UPLOAD_BYTES
    expected = min(expected, settings.MAX_UPLOAD_BYTES)
    try:
        free = shutil.disk_usage(TEMP_UPLOAD_DIR).free
    except OSError:
        # Cannot measure: never block an upload on a stat failure.
        return
    if free < expected * 2:
        raise HTTPException(
            status_code=507,
            detail=_cap_detail(
                "insufficient_storage",
                "The upload volume is nearly full. Clear temp files and retry.",
                free_bytes=free,
                required_bytes=expected * 2,
            ),
        )


def _save_upload_to_temp(file: UploadFile, max_bytes: int) -> tuple[str, str, int]:
    """Persist an uploaded stream to disk so PIL/EXIF and YOLO can read it.

    The SHA-256 of the raw bytes is computed while the stream is written
    (single pass over the multipart body) so callers can dedup re-uploads
    before Stage B ever touches the frame. Returns
    (temp_path, sha256_hex, size_bytes); refuses a file over `max_bytes` and
    deletes the partial write, because a rejected frame must not leak disk.
    """
    os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
    path = os.path.join(TEMP_UPLOAD_DIR, f"{uuid.uuid4()}_{file.filename}")
    hasher = hashlib.sha256()
    size = 0
    try:
        with open(path, "wb") as buffer:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise UploadRejected(
                        413,
                        _cap_detail(
                            "file_too_large",
                            f"Each frame must be at most {max_bytes // (1024 * 1024)} MB.",
                            filename=file.filename,
                            limit_bytes=max_bytes,
                        ),
                    )
                hasher.update(chunk)
                buffer.write(chunk)
    except BaseException:
        if os.path.exists(path):
            os.remove(path)
        raise
    return path, hasher.hexdigest(), size


def _extract_frames_sync(files: list[UploadFile]) -> tuple[list[dict], int]:
    """Save + EXIF pass for a whole batch. Blocking: call it in a threadpool.

    Every frame is written before any DB work starts, because the EXIF-majority
    vote decides the flight date. On any rejection, every temp file written so
    far is removed: no worker is enqueued for a request that never completes.
    """
    extracted: list[dict] = []
    total_bytes = 0
    try:
        for file in files:
            temp_path, content_hash, size = _save_upload_to_temp(
                file, settings.MAX_FILE_BYTES
            )
            total_bytes += size
            if total_bytes > settings.MAX_UPLOAD_BYTES:
                # This frame is not in `extracted` yet, so clean it here.
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                raise UploadRejected(
                    413,
                    _cap_detail(
                        "upload_too_large",
                        f"A single upload may carry at most "
                        f"{settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB. "
                        "Split the mission into separate uploads.",
                        limit_bytes=settings.MAX_UPLOAD_BYTES,
                        received_bytes=total_bytes,
                    ),
                )
            lat, lng = extract_gps(temp_path)
            width, height = extract_dimensions(temp_path)
            # exif_date feeds the flight-date majority vote (and the mismatch
            # warning); capture_ts is the full shutter datetime that becomes the
            # frame's stored captured_at and its detections' real timestamps
            # (midnight fallback when the frame carries no usable EXIF).
            exif_date = extract_capture_date(temp_path)
            capture_ts = extract_capture_datetime(temp_path)
            extracted.append({
                "id": str(uuid.uuid4()),
                "file": file,
                "temp_path": temp_path,
                "content_hash": content_hash,
                "lat": lat,
                "lng": lng,
                "width": width,
                "height": height,
                "exif_date": exif_date,
                "capture_ts": capture_ts,
            })
    except BaseException:
        for frame in extracted:
            path = frame.get("temp_path")
            if path and os.path.exists(path):
                os.remove(path)
        raise
    return extracted, total_bytes


async def _extract_frames_with_gate(
    files: list[UploadFile], declared_bytes: int | None
) -> tuple[list[dict], int]:
    """Single-flight wrapper for the blocking save/EXIF pass.

    The gate is held only while files are written — the window the caps were
    sized for. Counting and inference are not serialised by it.
    """
    async with _upload_gate():
        _ensure_temp_capacity(declared_bytes)
        return await run_in_threadpool(_extract_frames_sync, files)


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
    started = time.perf_counter()
    # Per-request id: stamped on every Image row this POST writes, so "which
    # request produced these 400 rows" is answerable without append support.
    # It is not a mission id — two chunks of one mission get different ids.
    batch_id = uuid.uuid4()

    # 0. Caps BEFORE anything is written. A rejected request must not create a
    # flight row (it is committed below, before dedup) and must not leave temp
    # files behind: the worker that normally deletes them is never enqueued.
    # The count is free; byte totals are enforced while streaming, so an
    # over-cap body still costs the transfer — the check saves disk, not
    # bandwidth (only a client picking fewer frames can prevent that wait).
    if len(files) > settings.MAX_FILES_PER_REQUEST:
        raise _cap_error(
            "too_many_files",
            f"At most {settings.MAX_FILES_PER_REQUEST} frames per upload. "
            "Split the mission into separate uploads.",
            limit=settings.MAX_FILES_PER_REQUEST,
            received=len(files),
        )

    declared = request.headers.get("content-length")
    declared_bytes = int(declared) if declared and declared.isdigit() else None

    # Hand the pooled connection back BEFORE the blocking pass below. The auth
    # dependency already opened a transaction on it, and the save/EXIF loop can
    # run for minutes on a large batch, so the connection would sit
    # idle-in-transaction the whole time — the one state a pooler (Neon)
    # reliably kills. Nothing from this session is needed during the pass, and
    # the session re-checks-out a fresh connection for the flight row below.
    # (A dead connection at checkout is what pool_pre_ping handles; this covers
    # a connection that dies while the request holds it.)
    db.close()

    # 1. Save streams to disk (hashing on the fly) and read EXIF metadata
    # from the file path. This must run BEFORE the flight row is created:
    # the EXIF-majority vote below decides the flight_date when the camera
    # disagrees with the typed form date.
    #
    # The pass is blocking (file IO + PIL + EXIF), so it runs in a threadpool:
    # on the event loop it froze the portal and the mobile API for the whole
    # upload, since this is the only worker. The gate keeps one batch writing
    # at a time so two concurrent uploads cannot double the disk exposure the
    # caps were sized for.
    try:
        extracted_frames, total_bytes = await _extract_frames_with_gate(
            files, declared_bytes
        )
    except UploadRejected as rejected:
        logger.warning(
            "Upload rejected (%s) batch=%s files=%d",
            rejected.detail.get("error"),
            batch_id,
            len(files),
        )
        raise HTTPException(status_code=rejected.status_code, detail=rejected.detail)

    saved_at = time.perf_counter()

    # EXIF-majority flight date. The camera's own dates are now the source
    # of truth for the flight record; the typed form date is demoted to a
    # plausibility anchor. Rules:
    #   - a date wins by frame count (audit-only / dedup-skipped frames
    #     included — their dates are just as honest as representative ones);
    #   - on an exact count tie the TYPED date still wins (an even split
    #     means the batch is ambiguous, so prefer the operator's intent);
    #   - with no plausible EXIF date anywhere the typed date stands
    #     unchanged (EXIF-less batches keep the old behavior exactly).
    # Plausibility is gated inside extract_capture_date (MIN_PLAUSIBLE_YEAR),
    # so a reset clock stuck in 1988 can never out-vote a real date.
    exif_date_counts: dict[str, int] = {}
    for frame in extracted_frames:
        exif_date = frame.get("exif_date")
        if exif_date:
            exif_date_counts[exif_date] = exif_date_counts.get(exif_date, 0) + 1

    typed_date_str = flight_date.isoformat()
    if exif_date_counts:
        effective_date_str = max(
            exif_date_counts.items(),
            # count desc, typed-date wins ties, then later date as a stable
            # deterministic fallback for a no-typed-date tie.
            key=lambda item: (item[1], item[0] == typed_date_str, item[0]),
        )[0]
        effective_flight_date = date.fromisoformat(effective_date_str)
    else:
        effective_date_str = typed_date_str
        effective_flight_date = flight_date

    # One flight log per batch; every image in the batch references it.
    flight = DroneFlightLog(
        flight_date=effective_flight_date,
        pilot_name=pilot_name,
        notes=notes,
        area_id=uuid.UUID(area_id) if area_id else None
    )
    db.add(flight)
    db.commit()
    db.refresh(flight)
    flight_id = str(flight.flight_id)
    if effective_date_str != typed_date_str:
        logger.info(
            "Flight %s date overridden by EXIF majority: typed %s -> EXIF %s",
            flight_id,
            typed_date_str,
            effective_date_str,
        )

    # 1a. Auto-detect assignment area (Upload page "Auto-detect from GPS").
    # The frontend omits area_id for "auto", which used to commit the flight
    # with area_id NULL and let TrashLogs show "Unassigned sector" — despite
    # every frame carrying EXIF GPS. Resolve the covering area per frame and
    # pick the majority. Manual selection always wins when given; if no
    # boundary covers any GPS point, stay UNASSIGNED (honest, surfaces
    # boundary gaps) rather than guessing the nearest area.
    if area_id is None:
        # ONE spatial query for the batch instead of one per frame: the old
        # loop ran a PostGIS scan per point — 400 sequential round-trips on
        # the only worker to answer what a single JOIN answers.
        resolved = resolve_areas_for_points(
            db, [(frame["lat"], frame["lng"]) for frame in extracted_frames]
        )
        tally: dict = {}
        for resolved_area_id in resolved.values():
            tally[resolved_area_id] = tally.get(resolved_area_id, 0) + 1
        if tally:
            # Majority by count, ties broken by area_id — the same
            # deterministic rule the per-point resolver documents.
            detected_area_id = max(
                tally.items(), key=lambda item: (item[1], str(item[0]))
            )[0]
            area_id = str(detected_area_id)
            detected_area = db.get(Area, detected_area_id)
            # The flight row was already committed with NULL above; update it
            # in place so TrashLogs/hexbin routes see the real assignment.
            flight.area_id = detected_area_id
            db.add(flight)
            db.commit()
            logger.info(
                "Auto-detected area %s for flight %s (from %d/%d GPS frames)",
                detected_area.area_name if detected_area else detected_area_id,
                flight_id,
                tally[detected_area_id],
                len(files),
            )
    resolved_at = time.perf_counter()

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
                # Real EXIF shutter time when the frame carries one, else the
                # admin-entered flight date at midnight (insert clock would
                # misdate historical flights).
                captured_at=member["capture_ts"]
                or datetime.combine(flight.flight_date, datetime.min.time()),
                is_representative=is_rep,
                cluster_id=cluster_str_id,
                processing_status=status,
                upload_batch=batch_id,
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
                    capture_ts=member["capture_ts"],
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
            captured_at=frame["capture_ts"]
            or datetime.combine(flight.flight_date, datetime.min.time()),
            is_representative=False,
            cluster_id=None,
            processing_status=ProcessingStatus.DUPLICATE_SKIPPED,
            upload_batch=batch_id,
        ))
        if os.path.exists(frame["temp_path"]):
            os.remove(frame["temp_path"])
    db.commit()

    # EXIF-date aid summary (additive response fields; the counts were
    # tallied earlier for the majority vote). mismatch is reported against
    # the date the admin TYPED — effective_flight_date is what actually
    # won the vote and was stored — so the uploader sees how far the form
    # drifted from the camera.
    flight_date_str = str(flight.flight_date)
    exif_date_mismatch_count = sum(
        count for exif_date, count in exif_date_counts.items()
        if exif_date != typed_date_str
    )

    # Suspicious-clock nudge: the majority EXIF year matching neither the
    # typed year nor the current year points at a drone clock reset to a
    # stale-but-plausible date — something the count-based plausibility
    # gate can't catch, and a human should check the drone clock before
    # trusting this flight's timeline.
    exif_year_suspicious: Optional[bool] = None
    if exif_date_counts:
        majority_year = int(effective_date_str[:4])
        exif_year_suspicious = (
            majority_year != flight_date.year
            and majority_year != datetime.now().year
        )

    # One structured line per upload: the gate in the plan reads file counts and
    # durations from here, so this must not drift into prose.
    logger.info(
        "upload batch=%s flight=%s files=%d bytes=%d save_ms=%d area_ms=%d "
        "reps=%d stage_a_dups=%d already_uploaded=%d",
        batch_id,
        flight_id,
        len(files),
        total_bytes,
        int((saved_at - started) * 1000),
        int((resolved_at - saved_at) * 1000),
        len([img for img in processed_images if img.is_representative]),
        len([img for img in processed_images if not img.is_representative]),
        len(already_uploaded_frames),
    )

    return {
        "status": "success",
        "batch_id": str(batch_id),
        "flight_id": flight_id,
        "pilot_name": pilot_name,
        "flight_date": flight_date_str,
        "effective_flight_date": effective_date_str,
        "exif_year_suspicious": exif_year_suspicious,
        "total_uploaded": len(files),
        "representatives_queued": len([img for img in processed_images if img.is_representative]),
        "duplicates_skipped": len([img for img in processed_images if not img.is_representative]),
        "already_uploaded": len(already_uploaded_frames),
        "exif_capture_dates": exif_date_counts,
        "exif_date_mismatch_count": exif_date_mismatch_count,
    }
