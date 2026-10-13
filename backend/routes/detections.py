from fastapi import APIRouter, UploadFile, File, Depends, Form, HTTPException, Query
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func
from database import get_db
from dependency import require_role, require_public
from services.detection_service import run_yolo_inference
from models.detection import Detection
from models.area import Area
import shutil, os, uuid
import math
from datetime import datetime

router = APIRouter()

# SECURITY: reads are PUBLIC (product decision 2026-10: the web TrashLogs page
# browses detections logged-out via "Open Forecast"). process (standalone YOLO
# inference) and delete stay admin-only — they mutate detection data and burn
# ML compute.

@router.post("/process")
async def process_drone_images(
    files: List[UploadFile] = File(...),
    flight_id: Optional[str] = Form(None),
    area_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    _admin=Depends(require_role("admin")),
):
    """
    Standalone inference for already-uploaded frames that have no flight
    pipeline behind them. Persists detections but does not create Image rows,
    so the caller supplies a real flight_id and a file whose EXIF carries GPS.
    """
    if not flight_id:
        raise HTTPException(status_code=400, detail="flight_id is required")
    try:
        uuid.UUID(flight_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid flight_id UUID format")

    os.makedirs("temp", exist_ok=True)
    saved_paths = []

    try:
        for file in files:
            path = os.path.join("temp", f"{uuid.uuid4()}_{file.filename}")
            with open(path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_paths.append(path)

        results = []
        for path in saved_paths:
            # No image_id: these frames have no Image row to link back to.
            results.extend(
                run_yolo_inference(
                    db,
                    file_path=path,
                    asset_url="",
                    flight_id=flight_id,
                    area_id=area_id,
                    lat=None,
                    lng=None,
                )
            )
    finally:
        for path in saved_paths:
            if os.path.exists(path):
                os.remove(path)

    return {"detections": results, "count": len(results)}


@router.get("/")
def get_all_detections(
    flight_id: Optional[str] = None,
    area_id: Optional[str] = None,
    waste_type: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Free-text search over waste_type and area name"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: Optional[int] = Query(None, ge=1, le=1000, description="Page size; omit for the legacy unpaginated full list"),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _user=Depends(require_public()),
):
    """
    Retrieves all detections directly returning pre-computed Stage B spatial metadata
    """
    query = db.query(Detection)

    if flight_id and flight_id.lower() != "all":
        try:
            query = query.filter(Detection.flight_id == uuid.UUID(flight_id))
        except ValueError:
            pass

    # 2. Safely handle area_id filtering
    if area_id and area_id.lower() != "all":
        try:
            query = query.filter(Detection.area_id == uuid.UUID(area_id))
        except ValueError:
            pass

    # 3. Filter by waste_type if specified
    if waste_type and waste_type.lower() != "all":
        query = query.filter(Detection.waste_type == waste_type)

    # 3b. Free-text search over waste_type and the linked area's name so the
    # web page can filter across ALL pages server-side (client-side search
    # only ever saw the current 15-row page).
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        query = query.outerjoin(Area, Detection.area_id == Area.area_id).filter(
            or_(
                func.lower(Detection.waste_type).like(term),
                func.lower(Area.area_name).like(term),
            )
        )

    # 4. Optional date window (inclusive). Accepts ISO datetimes or dates;
    # unparsable values are ignored rather than erroring the whole request.
    if date_from:
        try:
            query = query.filter(Detection.timestamp >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            # A bare date (no time part) is treated as that day's end so the
            # upper bound stays inclusive of the whole final day.
            dt_to = datetime.fromisoformat(date_to)
            if dt_to.time() == datetime.min.time():
                dt_to = dt_to.replace(hour=23, minute=59, second=59, microsecond=999999)
            query = query.filter(Detection.timestamp <= dt_to)
        except ValueError:
            pass

    # Deterministic paging: timestamp alone is not unique (drone flights
    # insert bursts of rows with identical timestamps), so add the PK as a
    # tie-breaker or offset pages can show duplicate/missing rows.
    ordered_query = query.order_by(Detection.timestamp.desc(), Detection.detection_id.desc())

    # Paginated mode: envelope response so the client knows the true filtered
    # total without a second COUNT request. The bare list is preserved when no
    # limit is sent — earlier consumers never paginated this endpoint.
    if limit is None:
        results = ordered_query.all()
        return [
            {
                "detection_id": str(det.detection_id),
                "flight_id": str(det.flight_id),
                "area_id": str(det.area_id) if det.area_id else None,
                "image_url": det.image_url,
                "waste_type": det.waste_type,
                "confidence_score": det.confidence_score,
                "latitude": det.latitude,
                "longitude": det.longitude,
                "cluster_count": det.duplicate_count,
                "cluster_id": det.cluster_id,
                "timestamp": det.timestamp.isoformat(),
                "bounding_boxes": getattr(det, "bounding_boxes", None) or [
                    {
                        "xmin": getattr(det, "bbox_x1", 0),
                        "ymin": getattr(det, "bbox_y1", 0),
                        "xmax": getattr(det, "bbox_x2", 0),
                        "ymax": getattr(det, "bbox_y2", 0),
                        "label": det.waste_type,
                        "confidence": det.confidence_score,
                    }
                ],
                "image_width": getattr(det, "image_width", 640),
                "image_height": getattr(det, "image_height", 640),
            }
            for det in results
        ]

    total = ordered_query.count()
    results = (
        ordered_query.options(joinedload(Detection.area))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "items": [
            {
                "detection_id": str(det.detection_id),
                "flight_id": str(det.flight_id),
                "area_id": str(det.area_id) if det.area_id else None,
                "image_url": det.image_url,
                "waste_type": det.waste_type,
                "confidence_score": det.confidence_score,
                "latitude": det.latitude,
                "longitude": det.longitude,
                "cluster_count": det.duplicate_count,
                "cluster_id": det.cluster_id,
                "timestamp": det.timestamp.isoformat(),
                "bounding_boxes": getattr(det, "bounding_boxes", None) or [
                    {
                        "xmin": getattr(det, "bbox_x1", 0),
                        "ymin": getattr(det, "bbox_y1", 0),
                        "xmax": getattr(det, "bbox_x2", 0),
                        "ymax": getattr(det, "bbox_y2", 0),
                        "label": det.waste_type,
                        "confidence": det.confidence_score,
                    }
                ],
                "image_width": getattr(det, "image_width", 640),
                "image_height": getattr(det, "image_height", 640),
            }
            for det in results
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
        "pages": max(1, math.ceil(total / limit)),
    }


@router.get("/{detection_id}")
def get_detection(
    detection_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_public()),
):
    try:
        target_uuid = uuid.UUID(detection_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid detection_id UUID format")

    detection = db.query(Detection).options(joinedload(Detection.area)).filter(
        Detection.detection_id == target_uuid
    ).first()
    
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
    return detection


@router.delete("/{detection_id}")
def delete_detection(
    detection_id: str,
    db: Session = Depends(get_db),
    _admin=Depends(require_role("admin")),
):
    try:
        target_uuid = uuid.UUID(detection_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid detection_id UUID format")

    detection = db.query(Detection).filter(
        Detection.detection_id == target_uuid
    ).first()
    
    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")
        
    db.delete(detection)
    db.commit()
    return {"message": "Detection deleted"}