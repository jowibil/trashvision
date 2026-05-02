from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models.trash_log import TrashLog
from models.detection import Detection
from models.report import Report
from typing import Optional
import uuid

router = APIRouter()

@router.get("/")
def get_trash_logs(
    area_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(TrashLog)
    if area_id:
        query = query.filter(TrashLog.area_id == uuid.UUID(area_id))
    return query.order_by(TrashLog.last_updated.desc()).all()

@router.get("/summary")
def get_waste_summary(
    area_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    detection_query = db.query(
        Detection.waste_type,
        func.count(Detection.detection_id).label("count")
    ).group_by(Detection.waste_type)

    if area_id:
        detection_query = detection_query.filter(
            Detection.area_id == uuid.UUID(area_id)
        )

    detection_summary = detection_query.all()

    report_query = db.query(
        Report.waste_type,
        func.count(Report.report_id).label("count")
    ).filter(Report.status == "verified").group_by(Report.waste_type)

    if area_id:
        report_query = report_query.filter(
            Report.area_id == uuid.UUID(area_id)
        )

    report_summary = report_query.all()

    combined = {}
    for row in detection_summary:
        combined[row.waste_type] = {
            "waste_type": row.waste_type,
            "detection_count": row.count,
            "report_count": 0
        }
    for row in report_summary:
        if row.waste_type in combined:
            combined[row.waste_type]["report_count"] = row.count
        else:
            combined[row.waste_type] = {
                "waste_type": row.waste_type,
                "detection_count": 0,
                "report_count": row.count
            }

    return sorted(
        combined.values(),
        key=lambda x: x["detection_count"] + x["report_count"],
        reverse=True
    )

@router.get("/{area_id}")
def get_logs_by_area(area_id: str, db: Session = Depends(get_db)):
    return db.query(TrashLog).filter(
        TrashLog.area_id == uuid.UUID(area_id)
    ).order_by(TrashLog.last_updated.desc()).all()