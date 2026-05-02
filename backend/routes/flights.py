from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.drone_flight_log import DroneFlightLog
from pydantic import BaseModel
from typing import Optional
from datetime import date
import uuid

router = APIRouter()

class FlightCreate(BaseModel):
    flight_date: date
    pilot_name: str
    area_covered: Optional[str] = None
    notes: Optional[str] = None
    area_id: Optional[str] = None

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

@router.get("/")
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
    return flight

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