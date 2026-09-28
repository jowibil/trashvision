from sqlalchemy.orm import Session
from sqlalchemy import func
from models.trash_log import TrashLog
from models.detection import Detection
from models.report import Report
from datetime import datetime
import uuid

def update_trash_logs(db: Session, area_id: str = None):
    # Fixed: Querying Detection.timestamp and tracking log updates accurately
    detection_query = db.query(
        Detection.waste_type,
        Detection.area_id,
        func.count(Detection.detection_id).label("det_count"),
        func.min(Detection.timestamp).label("oldest_det"),
        func.max(Detection.timestamp).label("newest_det")
    ).group_by(Detection.waste_type, Detection.area_id)

    if area_id:
        detection_query = detection_query.filter(Detection.area_id == uuid.UUID(area_id))
    
    detections_by_group = {
        (row.waste_type, row.area_id): row for row in detection_query.all()
    }

    report_query = db.query(
        Report.waste_type,
        Report.area_id,
        func.count(Report.report_id).label("rep_count"),
        func.min(Report.created_at).label("oldest_rep"),
        func.max(Report.created_at).label("newest_rep")
    ).filter(Report.status == "verified").group_by(Report.waste_type, Report.area_id)

    if area_id:
        report_query = report_query.filter(Report.area_id == uuid.UUID(area_id))
        
    reports_by_group = {
        (row.waste_type, row.area_id): row for row in report_query.all()
    }

    all_groups = set(detections_by_group.keys()).union(set(reports_by_group.keys()))
    now = datetime.now(timezone.utc)

    for waste_type, gid in all_groups:
        if not gid:
            continue

        det_row = detections_by_group.get((waste_type, gid))
        rep_row = reports_by_group.get((waste_type, gid))

        det_count = det_row.det_count if det_row else 0
        rep_count = rep_row.rep_count if rep_row else 0

        dates = []
        if det_row:
            dates.extend([det_row.oldest_det, det_row.newest_det])
        if rep_row:
            dates.extend([rep_row.oldest_rep, rep_row.newest_rep])
        
        period_start = min(dates) if dates else now
        period_end = max(dates) if dates else now

        log = db.query(TrashLog).filter(
            TrashLog.waste_type == waste_type,
            TrashLog.area_id == gid
        ).first()

        if log:
            log.detection_count = det_count
            log.report_count = rep_count
            log.period_start = period_start
            log.period_end = period_end
            log.last_updated = now
        else:
            log = TrashLog(
                waste_type=waste_type,
                area_id=gid,
                detection_count=det_count,
                report_count=rep_count,
                period_start=period_start,
                period_end=period_end,
                last_updated=now
            )
            db.add(log)

    db.commit()