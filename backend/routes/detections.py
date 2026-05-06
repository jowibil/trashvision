from fastapi import APIRouter, UploadFile, File, Depends, Form, HTTPException
from typing import List, Optional
from sqlalchemy.orm import Session
from database import get_db
from services.detection_service import process_images
from models.detection import Detection
import shutil, os, uuid

router = APIRouter()

@router.post("/process")
async def process_drone_images(
    files: List[UploadFile] = File(...),
    flight_id: Optional[str] = Form(None),
    area_id: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    os.makedirs("temp", exist_ok=True)
    saved_paths = []

    for file in files:
        path = f"temp/{uuid.uuid4()}_{file.filename}"
        with open(path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_paths.append(path)

    results = process_images(
        saved_paths,
        db,
        flight_id=flight_id,
        area_id=area_id
    )

    for path in saved_paths:
        if os.path.exists(path):
            os.remove(path)

    return {"detections": results, "count": len(results)}

@router.get("/")
def get_all_detections(
    area_id: Optional[str] = None,
    waste_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Detection)
    if area_id:
        query = query.filter(Detection.area_id == uuid.UUID(area_id))
    if waste_type:
        query = query.filter(Detection.waste_type == waste_type)
    return query.order_by(Detection.timestamp.desc()).all()

@router.get("/{detection_id}")
def get_detection(detection_id: str, db: Session = Depends(get_db)):
    detection = db.query(Detection).filter(
        Detection.detection_id == uuid.UUID(detection_id)
    ).first()
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    return detection

@router.delete("/{detection_id}")
def delete_detection(detection_id: str, db: Session = Depends(get_db)):
    detection = db.query(Detection).filter(
        Detection.detection_id == uuid.UUID(detection_id)
    ).first()
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    db.delete(detection)
    db.commit()
    return {"message": "Detection deleted"}