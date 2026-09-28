from fastapi import APIRouter, UploadFile, File, Depends, Form, HTTPException, Query
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from database import get_db
from services.detection_service import run_yolo_inference
from models.detection import Detection
from models.area import Area
import shutil, os, uuid

router = APIRouter()

@router.post("/process")
async def process_drone_images(
    files: List[UploadFile] = File(...),
    flight_id: Optional[str] = Form(None),
    area_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Standalone inference for already-uploaded frames that have no flight
    pipeline behind them. Persists detections but does not create Image rows,
    so the caller supplies a real flight_id and a file whose EXIF carries GPS.
    """
    if not flight_id:
        raise HTTPException(status_code=400, detail="flight_id is required")
    try:
        uuid.UUID(flight_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid flight_id UUID format")

    os.makedirs("temp", exist_ok=True)
    saved_paths = []

    try:
        for file in files:
            path = os.path.join("temp", f"{uuid.uuid4()}_{file.filename}")
            with open(path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_paths.append(path)

        results = []
        for path in saved_paths:
            # No image_id: these frames have no Image row to link back to.
            results.extend(
                run_yolo_inference(
                    db,
                    file_path=path,
                    asset_url="",
                    flight_id=flight_id,
                    area_id=area_id,
                    lat=None,
                    lng=None,
                )
            )
    finally:
        for path in saved_paths:
            if os.path.exists(path):
                os.remove(path)

    return {"detections": results, "count": len(results)}


@router.get("/")
def get_all_detections(
    flight_id: Optional[str] = None,
    area_id: Optional[str] = None,
    waste_type: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Retrieves all detections directly returning pre-computed Stage B spatial metadata
    """
    query = db.query(Detection)

    if flight_id and flight_id.lower() != "all":
        try:
            query = query.filter(Detection.flight_id == uuid.UUID(flight_id))
        except ValueError:
            pass

    # 2. Safely handle area_id filtering
    if area_id and area_id.lower() != "all":
        try:
            query = query.filter(Detection.area_id == uuid.UUID(area_id))
        except ValueError:
            pass

    # 3. Filter by waste_type if specified
    if waste_type and waste_type.lower() != "all":
        query = query.filter(Detection.waste_type == waste_type)

    results = query.order_by(Detection.timestamp.desc()).all()

    return [
        {
            "detection_id": str(det.detection_id),
            "flight_id": str(det.flight_id),
            "area_id": str(det.area_id) if det.area_id else None,
            "image_url": det.image_url,
            "waste_type": det.waste_type,
            "confidence_score": det.confidence_score,
            "latitude": det.latitude,
            "longitude": det.longitude,
            "cluster_count": det.duplicate_count, 
            "cluster_id": det.cluster_id,
            "timestamp": det.timestamp.isoformat(),
            "bounding_boxes": getattr(det, "bounding_boxes", None) or [
                {
                    "xmin": getattr(det, "bbox_x1", 0),
                    "ymin": getattr(det, "bbox_y1", 0),
                    "xmax": getattr(det, "bbox_x2", 0),
                    "ymax": getattr(det, "bbox_y2", 0),
                    "label": det.waste_type,
                    "confidence": det.confidence_score,
                }
            ],
            "image_width": getattr(det, "image_width", 640),
            "image_height": getattr(det, "image_height", 640),
        }
        for det in results
    ]


@router.get("/{detection_id}")
def get_detection(detection_id: str, db: Session = Depends(get_db)):
    try:
        target_uuid = uuid.UUID(detection_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid detection_id UUID format")

    detection = db.query(Detection).options(joinedload(Detection.area)).filter(
        Detection.detection_id == target_uuid
    ).first()
    
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    return detection


@router.delete("/{detection_id}")
def delete_detection(detection_id: str, db: Session = Depends(get_db)):
    try:
        target_uuid = uuid.UUID(detection_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid detection_id UUID format")

    detection = db.query(Detection).filter(
        Detection.detection_id == target_uuid
    ).first()
    
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
        
    db.delete(detection)
    db.commit()
    return {"message": "Detection deleted"}