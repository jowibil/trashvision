from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db
from models.drone_flight_log import DroneFlightLog
from models.image import Image, ProcessingStatus
from models.detection import Detection
from routes.helper.utils import FlightCreate, FlightResponse
from services.gps_service import extract_gps, extract_dimensions
from services.detection_service import process_image_upload
from services.dbscan_service import cluster_points
from typing import Optional
from datetime import date
import uuid
import shutil
import os

router = APIRouter()

# Directory where uploaded frames are staged before the background worker
# uploads them to Cloudinary. Cleaned up per-file by the worker.
TEMP_UPLOAD_DIR = "temp"


@router.post("/")
def create_flight(data: FlightCreate, db: Session = Depends(get_db)):
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
def get_all_flights(db: Session = Depends(get_db)):
    return db.query(DroneFlightLog).order_by(
        DroneFlightLog.flight_date.desc()
    ).all()

@router.get("/areas/{area_id}/collection")
def get_area_image_collection(area_id: str, db: Session = Depends(get_db)):
    try:
        area_uuid = uuid.UUID(area_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid area UUID format")

    detections = db.query(Detection).filter(Detection.area_id == area_uuid).all()

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

            "image_id": str(d.detection_id),
            "file_url": d.image_url,
            "type": d.waste_type
        }
        for d in detections
    ]

@router.get("/{flight_id}")
def get_flight(flight_id: str, db: Session = Depends(get_db)):
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
def delete_flight(flight_id: str, db: Session = Depends(get_db)):
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
async def upload_flight_batch(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),

    area_id: Optional[str] = Form(None),
    flight_date: date = Form(...),
    pilot_name: str = Form(...),
    notes: str = Form(...),

    db: Session = Depends(get_db)
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
