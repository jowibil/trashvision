from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from dependency import require_role, require_public
from models.report import Report
from models.user import User
from services.cloudinary_service import upload_image
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from geoalchemy2 import WKTElement
from geoalchemy2.shape import to_shape
from routes.helper.utils import ReportPublic, BulkDeleteRequest
from services.geo_assign import resolve_area_for_point

router = APIRouter()

# SECURITY: GET / (community feed read) is PUBLIC per product decision
# 2026-10 — the web Reports page is browsable logged-out via "Open Forecast".
# Everything else still requires a valid JWT: submit is guest-level (the app's
# core community-reporting flow), status changes and bulk deletes are
# admin-only (web AuthReport page). User-specific report history keeps a
# mandatory JWT — it is inherently personal data.

@router.post("/", response_model=ReportPublic)
async def submit_report(
    waste_type: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    area_id: Optional[str] = Form(None),
    client_report_id: Optional[str] = Form(None),
    photo: UploadFile = File(None),
    description: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user=Depends(require_role("guest")),
):
    # FIX (NameError): the handler referenced an undefined `user_id`, so every
    # POST /reports/ died with a 500. The reporter is the JWT's user — the
    # client never supplies it (web/mobile alike; user_id is not a form field).
    # Mobile's offline outbox also stores a client-side user_id for display
    # only; the server value is authoritative here.
    client_uuid = uuid.UUID(client_report_id) if client_report_id else None

    # Auto-assign area: mobile submits never send one, so every report used
    # to land with area_id NULL and the mobile map's per-area community pin
    # query (GET /reports/?area_id=) never matched them. The point-in-polygon
    # resolver attaches the covering boundary area; reports outside every
    # drawn boundary honestly stay NULL (no pin, no silent guess).
    resolved_area_id = None
    if area_id:
        resolved_area_id = uuid.UUID(area_id)
    else:
        resolved_area = resolve_area_for_point(db, latitude, longitude)
        if resolved_area is not None:
            resolved_area_id = resolved_area.area_id

    # Idempotency guard: the mobile outbox resends the same report (same
    # client UUID) after a lost/crashed submit, otherwise a crash after
    # commit produced duplicate rows (2026-10-14: 2 reports became 4 after
    # a server restart). The check runs BEFORE the photo upload so a retry
    # does not re-land the image on Cloudinary either.
    if client_uuid:
        existing = (
            db.query(Report)
            .filter(Report.client_report_id == client_uuid)
            .first()
        )
        if existing:
            return existing

    photo_url = None
    if photo:
        photo_url = await upload_image(photo)

    geom_point = f"POINT({longitude} {latitude})"

    report = Report(
        waste_type=waste_type,
        geom=WKTElement(geom_point, srid=4326),
        user_id=user.user_id,
        client_report_id=client_uuid,
        area_id=resolved_area_id,
        photo_url=photo_url,
        description=description,
        timestamp=datetime.now(timezone.utc),
        status="pending",
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # Report.latitude/longitude (and reporter_name) are read-only @property
    # getters derived from geom / the user relationship — assigning to them
    # raised "property has no setter" right after commit, so every POST
    # returned a 500 even though the row was saved. The properties already
    # compute the coordinates from the geometry that was just written, so
    # nothing needs to be set here.
    return report

@router.get("/", response_model=List[ReportPublic])
def get_all_reports(
    status: Optional[str] = None,
    area_id: Optional[str] = None,
    # Default raised 10 → 200: the old default silently capped every consumer
    # that omitted limit (web map's community layer + Reports page), dropping
    # the oldest verified reports from the map/feed with no error anywhere.
    # 200 matches what the mobile map layer already requests explicitly, so
    # both platforms now agree on the ceiling. Bounds mirror detections.py's
    # page-size guard; callers can still send an explicit (smaller) limit.
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _user=Depends(require_public()),
):
    query = db.query(Report)
    if status:
        query = query.filter(Report.status == status)
    if area_id:
        query = query.filter(Report.area_id == uuid.UUID(area_id))
        
    results = query.order_by(Report.timestamp.desc()).limit(limit).offset(offset).all()
    
    response_payload = []
    for report in results:
        # Extract coordinates safely from geoalchemy spatial point
        lat, lng = 0.0, 0.0
        if report.geom:
            geom = to_shape(report.geom)
            lat = geom.y
            lng = geom.x
            
        # FIXED: Pack parameters cleanly into dictionaries to bypass read-only SQLAlchemy attributes
        # Also injects the 'reporter_name' field to ensure the ReportPublic validation passes.
        response_payload.append({
            "report_id": report.report_id,
            "waste_type": report.waste_type,
            "user_id": report.user_id,
            "area_id": report.area_id,
            "photo_url": report.photo_url,
            "description": report.description,
            "status": report.status,
            "timestamp": report.timestamp,
            "latitude": lat,
            "longitude": lng,
            "reporter_name": "Community Citizen"  # Match schema requirement safely
        })
            
    return response_payload

@router.get("/user/{user_id}", response_model=List[ReportPublic])
def get_reports_by_user(
    user_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role("guest")),
):
    query_results = db.query(Report, User.name).join(
        User, Report.user_id == User.user_id
    ).filter(
        Report.user_id == uuid.UUID(user_id)
    ).order_by(Report.timestamp.desc()).all()
    
    response_payload = []
    for report, user_name in query_results:
        lat, lng = 0.0, 0.0
        if report.geom:
            geom = to_shape(report.geom)
            lat = geom.y
            lng = geom.x
            
        response_payload.append({
            "report_id": report.report_id,
            "waste_type": report.waste_type,
            "user_id": report.user_id,
            "area_id": report.area_id,
            "photo_url": report.photo_url,
            "description": report.description,
            "status": report.status,
            "timestamp": report.timestamp,
            "latitude": lat,
            "longitude": lng,
            "reporter_name": user_name  
        })
            
    return response_payload

@router.get("/{report_id}", response_model=ReportPublic)
def get_report(
    report_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role("guest")),
):
    report = db.query(Report).filter(
        Report.report_id == uuid.UUID(report_id)
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    lat, lng = 0.0, 0.0
    if report.geom:
        geom = to_shape(report.geom)
        lat = geom.y
        lng = geom.x
        
    return {
        "report_id": report.report_id,
        "waste_type": report.waste_type,
        "user_id": report.user_id,
        "area_id": report.area_id,
        "photo_url": report.photo_url,
        "description": report.description,
        "status": report.status,
        "timestamp": report.timestamp,
        "latitude": lat,
        "longitude": lng,
    }

@router.patch("/{report_id}/status")
def update_report_status(
    report_id: str,
    status: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_role("admin")),
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
def bulk_delete_reports(
    data: BulkDeleteRequest,
    db: Session = Depends(get_db),
    _admin=Depends(require_role("admin")),
):
    db.query(Report).filter(Report.report_id.in_(data.report_ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": "Purged successfully"}