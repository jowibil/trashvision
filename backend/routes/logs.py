from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models.trash_log import TrashLog
from models.detection import Detection
from models.report import Report
from models.area import Area

from typing import Optional
from datetime import timezone, datetime, timedelta
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
def get_dashboard_summary(db: Session = Depends(get_db)):
    total_detections = db.query(func.count(Detection.detection_id)).scalar() or 0

    frequent_query = db.query(
        Detection.waste_type,
        func.count(Detection.detection_id).label("material_count")
    ).group_by(Detection.waste_type)\
     .order_by(func.count(Detection.detection_id).desc())\
     .first()
    
    most_frequent_type = frequent_query.waste_type if frequent_query else "None Registered"

    hotspot_query = db.query(
        Area.area_name,
        func.count(Detection.detection_id).label("total_detections")
    ).join(Detection, Detection.area_id == Area.area_id)\
     .group_by(Area.area_id, Area.area_name)\
     .order_by(func.count(Detection.detection_id).desc())\
     .first()
     
    most_affected_area = hotspot_query.area_name if hotspot_query else "Clear Grid"

    hotspot_zones = []
    zones_query = db.query(
        Area.area_id,
        Area.area_name,
        func.count(Detection.detection_id).label("density"),
        func.max(Detection.timestamp).label("latest_activity")
    ).outerjoin(Detection, Detection.area_id == Area.area_id)\
     .group_by(Area.area_id, Area.area_name)\
     .order_by(func.count(Detection.detection_id).desc())\
     .limit(4)\
     .all()

    for zone in zones_query:
        if zone.density > 50:
            severity = "Critical"
        elif zone.density > 20:
            severity = "High"
        elif zone.density > 5:
            severity = "Medium"
        else:
            severity = "Low"

        formatted_date = zone.latest_activity.strftime("%B %d, %Y") if zone.latest_activity else "No Active Flight Data"

        hotspot_zones.append({
            "id": str(zone.area_id),
            "name": zone.area_name,
            "date": formatted_date,
            "severity": severity
        })

    weekly_trends = []
    now = datetime.now(timezone.utc)
    # Walk backward across the current calendar week offset
    for i in range(7):
        target_day = now - timedelta(days=(now.weekday() - i) % 7)
        start_of_day = datetime(target_day.year, target_day.month, target_day.day, 0, 0, 0, tzinfo=timezone.utc)
        end_of_day = datetime(target_day.year, target_day.month, target_day.day, 23, 59, 59, tzinfo=timezone.utc)
        
        day_sum = db.query(func.count(Detection.detection_id))\
                    .filter(Detection.timestamp.between(start_of_day, end_of_day)).scalar() or 0
        weekly_trends.append(int(day_sum))

    composition = []
    if total_detections > 0:
        comp_query = db.query(
            Detection.waste_type,
            func.count(Detection.detection_id).label("type_sum")
        ).group_by(Detection.waste_type)\
         .order_by(func.count(Detection.detection_id).desc())\
         .all()
        
        for row in comp_query:
            pct = (row.type_sum / total_detections) * 100
            composition.append({"type": row.waste_type, "percentage": round(pct, 1)})

    return {
        "total_detections": int(total_detections),
        "most_frequent_type": most_frequent_type,
        "most_affected_area": most_affected_area,
        "weekly_trends": weekly_trends,
        "waste_composition": composition,
        "hotspot_zones": hotspot_zones
    }

@router.get("/{area_id}")
def get_logs_by_area(area_id: str, db: Session = Depends(get_db)):
    return db.query(TrashLog).filter(
        TrashLog.area_id == uuid.UUID(area_id)
    ).order_by(TrashLog.last_updated.desc()).all()