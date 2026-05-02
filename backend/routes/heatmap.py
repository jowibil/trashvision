from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models.detection import Detection
from models.report import Report
from typing import Optional

router = APIRouter()

@router.get("/")
def get_heatmap_data(
    area_id: Optional[str] = None,
    include_reports: bool = False,
    db: Session = Depends(get_db)
):
    detection_query = db.query(Detection)
    if area_id:
        import uuid
        detection_query = detection_query.filter(
            Detection.area_id == uuid.UUID(area_id)
        )

    detections = detection_query.all()
    points = [
        {
            "lat": d.latitude,
            "lng": d.longitude,
            "weight": round(d.confidence_score, 2),
            "waste_type": d.waste_type,
            "source": "detection"
        }
        for d in detections
        if d.latitude and d.longitude
    ]

    if include_reports:
        reports = db.query(Report).filter(Report.status == "verified").all()
        for r in reports:
            if r.latitude and r.longitude:
                points.append({
                    "lat": r.latitude,
                    "lng": r.longitude,
                    "weight": 0.7,
                    "waste_type": r.waste_type,
                    "source": "report"
                })

    return {"points": points, "total": len(points)}