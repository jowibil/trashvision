# backend/services/detection_service.py
import os
import uuid
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ml.detect import trash_detector
from models.detection import Detection
from models.drone_flight_log import DroneFlightLog
from models.image import Image, ProcessingStatus
from services.dbscan_service import cluster_boxes, STAGE_B_IOU_EPS
from services.cloudinary_service import upload_drone_image
from database import SessionLocal

logger = logging.getLogger(__name__)

# LEGACY REFERENCE ONLY (the pre-2026-11-11 Stage B rule) — nothing in this
# module computes with these any more. Stage B used to merge boxes whose pixel
# positions sat within 2.5 × GSD of each other, but every box in a frame
# shares that frame's single GPS fix, so the radius separated nothing and the
# pipeline collapsed each frame to ONE detection. Stage B is now an IoU test
# (dbscan_service.STAGE_B_IOU_EPS). The values are kept, and still served by
# routes/info.py, as the documented history of the old rule.
STAGE_B_GSD_FACTOR = 2.5
GSD_DEFAULT_METERS = 0.05


def _error_text(exc: BaseException) -> str:
    """One-line failure reason stored in images.processing_error.

    The exception class leads so a support query can group by failure kind
    (`LIKE 'TimeoutError:%'`) even though the column is free text.
    """
    return f"{type(exc).__name__}: {exc}"[:1000]


def run_yolo_inference(
    db: Session,
    file_path: str,
    asset_url: str,
    flight_id: str,
    area_id: str | None,
    lat: float | None,
    lng: float | None,
    image_id: str | None = None,
    # Per-frame EXIF shutter time (from the upload pipeline). When present
    # it becomes detections.timestamp directly; when absent we fall back to
    # the flight-date midnight below, which the UI exports blank instead of
    # showing a fake 12:00 AM.
    frame_ts: "datetime | None" = None,
):
    """
    Stage B Detection-Level DBSCAN Implementation.
    Runs the YOLOv8 model on one frame, applies DBSCAN clustering on the raw
    detections, and persists one deduped Detection per cluster.

    Stage B asks one question: "are these two boxes the same object in this
    picture?", i.e. overlap (IoU), class-agnostic. It is NOT a distance test —
    every raw box from a frame carries the same lat/lng, so no metric radius
    can tell a duplicate box from a neighbouring object. cluster_boxes() does
    the grouping in pixel space; the frame's GPS point is then stamped on
    every retained row.

    `image_id` links the persisted detections back to their source Image row.
    A frame with no EXIF GPS keeps its rows with lat/lng NULL (the map filters
    those out) — dedup still applies, because overlap needs no coordinates.
    """
    raw_detections = trash_detector.run_inference(file_path)
    if not raw_detections:
        return []

    # Temporal source of truth is the frame's own EXIF capture time when the
    # pipeline extracted one; otherwise the admin-entered flight date —
    # never the worker's insert clock: the map's month/year/week windows
    # filter detections.timestamp, so stamping insert time put historical
    # flight pins into the upload month instead of the flight month.
    detection_ts: datetime | None = frame_ts
    if detection_ts is None and flight_id:
        flight = db.get(DroneFlightLog, uuid.UUID(flight_id))
        if flight is not None and flight.flight_date is not None:
            # Naive midnight of the flight date, matching the detections
            # column type (TIMESTAMP without tz).
            detection_ts = datetime.combine(flight.flight_date, datetime.min.time())

    # Stage B: group overlapping same-frame boxes (IoU >= 1 - eps) and keep
    # the highest-confidence box of each group below. Coordinates play no part
    # here — they belong to the frame, and every member shares them.
    clustered_detections = cluster_boxes(raw_detections, min_iou=STAGE_B_IOU_EPS)

    db_detections = []
    for cluster in clustered_detections:
        best_member = max(
            cluster["members"],
            key=lambda m: m["raw_det"]["confidence_score"],
        )
        best_det = best_member["raw_det"]

        new_detection = Detection(
            flight_id=uuid.UUID(flight_id),
            area_id=uuid.UUID(area_id) if area_id else None,
            image_id=uuid.UUID(image_id) if image_id else None,
            image_url=asset_url,
            waste_type=best_det["classification"],
            confidence_score=best_det["confidence_score"],
            bbox_x1=best_det["bounding_box"][0],
            bbox_y1=best_det["bounding_box"][1],
            bbox_x2=best_det["bounding_box"][2],
            bbox_y2=best_det["bounding_box"][3],
            # The frame's own fix: Stage B groups by overlap, so every
            # retained row sits at the position the picture was taken from
            # (None when the frame had no EXIF GPS).
            latitude=lat,
            longitude=lng,
            duplicate_count=cluster["member_count"],
            cluster_id=str(cluster["cluster_id"]),
        )
        if detection_ts is not None:
            new_detection.timestamp = detection_ts
        db.add(new_detection)
        db_detections.append(new_detection)

    db.commit()
    return db_detections


def process_image_upload(
    file_path: str,
    flight_id: str,
    area_id: str | None,
    filename: str,
    lat: float | None,
    lng: float | None,
    image_id: str | None = None,
    capture_ts: "datetime | None" = None,
):
    """
    Canonical Stage B background worker (runs in a threadpool via
    BackgroundTasks). Uploads the frame to Cloudinary, promotes the Image row
    out of PENDING, runs inference, and always cleans up the temp file.

    This is the single pipeline entry point -- routes must not re-implement it.
    """
    db = SessionLocal()
    try:
        secure_url = upload_drone_image(file_path, flight_id)

        if image_id:
            image = db.get(Image, uuid.UUID(image_id))
            if image is not None:
                if secure_url:
                    # Point the row at the uploaded asset now, but leave it
                    # `pending`: "done" has to mean ANALYSIS finished, not
                    # that the file reached storage. Marking done here made a
                    # flight read fully analysed while YOLO had not started,
                    # so a poller could stop on numbers that were still moving.
                    image.file_url = secure_url
                    image.asset_url = secure_url
                else:
                    image.processing_status = ProcessingStatus.FAILED
                    image.processing_error = (
                        "CloudinaryUploadError: upload returned no secure_url"
                    )
                db.commit()

        if not secure_url:
            logger.error(
                "Cloudinary upload failed for %s (flight %s); skipping inference",
                filename,
                flight_id,
            )
            return

        run_yolo_inference(
            db=db,
            file_path=file_path,
            asset_url=secure_url,
            flight_id=flight_id,
            area_id=area_id,
            lat=lat,
            lng=lng,
            image_id=image_id,
            frame_ts=capture_ts,
        )

        # Critical-area alert trigger (brief Task 3a): after this frame's
        # detections land, the affected area is re-evaluated with the SQL +
        # template pipeline (no LLM). Cheap count queries; the dedup rule in
        # insights_service keeps repeat runs from creating duplicate rows.
        # Full sweeps over ALL areas run weekly from main.py's sweep thread.
        if area_id:
            try:
                from models.area import Area
                from services.insights_service import evaluate_area

                area = db.get(Area, uuid.UUID(area_id))
                if area is not None:
                    evaluate_area(db, area)
            except Exception:
                db.rollback()
                # Alerting must never fail the upload pipeline.
                logger.exception("Alert evaluation failed (area %s)", area_id)

        # Only now is the frame actually analysed: storage + inference both
        # succeeded, so `done` no longer overstates progress.
        if image_id:
            image = db.get(Image, uuid.UUID(image_id))
            if image is not None:
                image.processing_status = ProcessingStatus.COMPLETED
                image.processing_error = None
                db.commit()

        logger.info("YOLO inference complete for %s (flight %s)", filename, flight_id)

    except Exception as exc:
        db.rollback()
        logger.exception("Background pipeline failure for %s (flight %s)", filename, flight_id)
        if image_id:
            try:
                image = db.get(Image, uuid.UUID(image_id))
                if image is not None:
                    image.processing_status = ProcessingStatus.FAILED
                    # A bare `failed` is unauditable — the operator cannot tell
                    # a Cloudinary outage from a corrupt frame.
                    image.processing_error = _error_text(exc)
                    db.commit()
            except Exception:
                db.rollback()
    finally:
        db.close()
        # Cleanup temp stream data to prevent server disk leak.
        if os.path.exists(file_path):
            os.remove(file_path)
