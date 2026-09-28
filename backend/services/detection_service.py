# backend/services/detection_service.py
import os
import uuid
import logging

from sqlalchemy.orm import Session

from ml.detect import trash_detector
from models.detection import Detection
from models.image import Image, ProcessingStatus
from services.dbscan_service import cluster_points
from services.cloudinary_service import upload_drone_image
from database import SessionLocal

logger = logging.getLogger(__name__)


def run_yolo_inference(
    db: Session,
    file_path: str,
    asset_url: str,
    flight_id: str,
    area_id: str | None,
    lat: float | None,
    lng: float | None,
    image_id: str | None = None,
    gsd_meters: float = 0.05,
):
    """
    Stage B Detection-Level DBSCAN Implementation.
    Runs the YOLOv8 model on one frame, applies DBSCAN clustering on the raw
    detections, and persists one deduped Detection per cluster.

    `image_id` links the persisted detections back to their source Image row.
    Frames without EXIF GPS (lat/lng None) skip spatial clustering since all
    their raw boxes share no location context.
    """
    raw_detections = trash_detector.run_inference(file_path)
    if not raw_detections:
        return []

    if lat is None or lng is None:
        # No geotag: keep every raw detection as its own unclustered row.
        clustered_detections = [
            {
                "cluster_id": idx,
                "representative_point": {"lat": None, "lng": None, "member_id": idx},
                "members": [{"raw_det": det}],
                "member_count": 1,
            }
            for idx, det in enumerate(raw_detections)
        ]
    else:
        detection_points = [
            {"id": idx, "lat": lat, "lng": lng, "raw_det": det}
            for idx, det in enumerate(raw_detections)
        ]

        # All raw boxes from one frame share the frame's GPS point, so the eps
        # is derived from the ground sample distance: boxes nearer than this
        # are treated as the same physical object.
        eps_detection = 2.5 * gsd_meters
        clustered_detections = cluster_points(
            detection_points, eps_meters=eps_detection, min_samples=1
        )

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
            latitude=cluster["representative_point"]["lat"],
            longitude=cluster["representative_point"]["lng"],
            duplicate_count=cluster["member_count"],
            cluster_id=str(cluster["cluster_id"]),
        )
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
                    image.file_url = secure_url
                    image.asset_url = secure_url
                    image.processing_status = ProcessingStatus.COMPLETED
                else:
                    image.processing_status = ProcessingStatus.FAILED
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
        )
        logger.info("YOLO inference complete for %s (flight %s)", filename, flight_id)

    except Exception:
        db.rollback()
        logger.exception("Background pipeline failure for %s (flight %s)", filename, flight_id)
        if image_id:
            try:
                image = db.get(Image, uuid.UUID(image_id))
                if image is not None:
                    image.processing_status = ProcessingStatus.FAILED
                    db.commit()
            except Exception:
                db.rollback()
    finally:
        db.close()
        # Cleanup temp stream data to prevent server disk leak.
        if os.path.exists(file_path):
            os.remove(file_path)
