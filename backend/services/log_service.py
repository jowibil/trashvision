from sqlalchemy.orm import Session
from sqlalchemy import func
from models.trash_log import TrashLog
from models.detection import Detection
from models.report import Report
from datetime import datetime
import uuid

def update_trash_logs(db: Session, area_id: str = None):
    detection_query = db.query(
        Detection.waste_type,
        Detection.area_id,
        func.count(Detection.detection_id).label("count")
    ).group_by(Detection.waste_type, Detection.area_id)

    if area_id:
        detection_query = detection_query.filter(
            Detection.area_id == uuid.UUID(area_id)
        )

    for row in detection_query.all():
        log = db.query(TrashLog).filter(
            TrashLog.waste_type == row.waste_type,
            TrashLog.area_id == row.area_id
        ).first()

        if log:
            log.detection_count = row.count
            log.last_updated = datetime.utcnow()
        else:
            log = TrashLog(
                waste_type=row.waste_type,
                area_id=row.area_id,
                detection_count=row.count,
                report_count=0,
                period_start=datetime.utcnow(),
                period_end=datetime.utcnow(),
                last_updated=datetime.utcnow()
            )
            db.add(log)

    report_query = db.query(
        Report.waste_type,
        Report.area_id,
        func.count(Report.report_id).label("count")
    ).filter(Report.status == "verified").group_by(
        Report.waste_type, Report.area_id
    )

    for row in report_query.all():
        log = db.query(TrashLog).filter(
            TrashLog.waste_type == row.waste_type,
            TrashLog.area_id == row.area_id
        ).first()

        if log:
            log.report_count = row.count
            log.last_updated = datetime.utcnow()

    db.commit()