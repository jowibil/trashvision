from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from database import get_db, SessionLocal
from models.drone_flight_log import DroneFlightLog
from models.image import Image as ImageModel
from routes.helper.utils import FlightCreate, FlightResponse
from services.gps_service import extract_gps
from services.cloudinary_service import upload_drone_image
from pydantic import BaseModel
from typing import Optional
from datetime import date
import uuid
import shutil
import os

router = APIRouter()



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
    
@router.get("/areas/{area_id}/collection")
def get_area_image_collection(area_id: str, db: Session = Depends(get_db)):
    images = db.query(ImageModel).join(DroneFlightLog).filter(
        DroneFlightLog.area_id == uuid.UUID(area_id)
    ).all()
    
    return images

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

async def process_image_upload(temp_path: str, flight_id: str, filename: str, lat: float, lng: float):
    db = SessionLocal()
    try:
        secure_url = await upload_drone_image(temp_path, flight_id)

        if secure_url:
            new_image = ImageModel(
                flight_id=flight_id,
                latitude=lat,
                longitude=lng,
                file_url=secure_url,
                filename=filename
            )
            db.add(new_image)
            db.commit()
            print(f"Successfully processed {filename}")
    except Exception as e:
        print(f"Background Process Error for {filename}: {e}")
        db.rollback()
    finally:
        db.close()
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/upload-batch")
async def upload_flight_batch(
    background_tasks: BackgroundTasks,
    flight_date: date = Form(...),
    pilot_name: str = Form(...),
    notes: str = Form(...),
    area_id: Optional[str] = Form(None),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    flight = DroneFlightLog(
        flight_date=flight_date,
        pilot_name=pilot_name,
        notes = notes,
        area_id=uuid.UUID(area_id) if area_id else None
    )
    db.add(flight)
    db.commit()
    db.refresh(flight)

    for file in files:
        temp_path = f"temp_{uuid.uuid4()}_{file.filename}"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        lat, lng = extract_gps(temp_path)

        background_tasks.add_task(
            process_image_upload, 
            temp_path, 
            str(flight.flight_id), 
            file.filename, 
            lat, 
            lng
        )

    return {
        "flight_id": flight.flight_id,
        "message": f"Flight log created. Processing {len(files)} images in background."
    }


