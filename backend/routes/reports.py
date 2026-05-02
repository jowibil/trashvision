from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models.report import Report
from services.cloudinary_service import upload_image
import uuid
from datetime import datetime, timezone
from typing import Optional
from geoalchemy2 import WKTElement
from geoalchemy2.shape import to_shape
from routes.helper.utils import ReportPublic, BulkDeleteRequest
from typing import List
router = APIRouter()



@router.post("/")
async def submit_report(
    waste_type: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    user_id: str = Form(...),
    area_id: Optional[str] = Form(None),
    photo: UploadFile = File(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):  
    photo_url = None
    if photo:
        photo_url = await upload_image(photo)
    geom_point = f"POINT({longitude} {latitude})"
    report = Report(
        waste_type=waste_type,
        geom=WKTElement(geom_point, srid=4326),
        user_id=uuid.UUID(user_id),
        area_id=uuid.UUID(area_id) if area_id else None,
        photo_url=photo_url,
        description=description,
        timestamp=datetime.now(timezone.utc),
        status="pending",
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    geom = to_shape(report.geom)

    return {
        "id": str(report.report_id),
        "waste_type": report.waste_type,
        "user_id": str(report.user_id),
        "area_id": str(report.area_id) if report.area_id else None,
        "photo_url": report.photo_url,
        "description": report.description,
        "timestamp": report.timestamp,
        "status": report.status,
        "location": {
            "lat": geom.y,
            "lng": geom.x
        }
    }

@router.get("/", response_model=List[ReportPublic])
def get_all_reports(
    status: Optional[str] = None,
    area_id: Optional[str] = None,
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    return db.query(Report).filter(Report.status == status)\
    .order_by(Report.timestamp.desc())\
    .limit(limit).offset(offset).all()

@router.get("/user/{user_id}")
def get_reports_by_user(user_id: str, db: Session = Depends(get_db)):
    return db.query(Report).filter(
        Report.user_id == uuid.UUID(user_id)
    ).order_by(Report.timestamp.desc()).all()

@router.get("/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    report = db.query(Report).filter(
        Report.report_id == uuid.UUID(report_id)
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report

@router.patch("/{report_id}/status")
def update_report_status(
    report_id: str,
    status: str,
    db: Session = Depends(get_db)
):
    if status not in ["pending", "verified", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status value")
    report = db.query(Report).filter(Report.report_id == uuid.UUID(report_id)).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = status
    db.commit()
    db.refresh(report)
    return {"message": "success", "new_status": report.status}

@router.delete("/bulk")
def bulk_delete_reports(data: BulkDeleteRequest, db: Session = Depends(get_db)):
    db.query(Report).filter(Report.report_id.in_(data.report_ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": "Purged successfully"}

