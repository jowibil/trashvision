from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models.area import Area
from models.report import Report
from routes.helper.utils import ReportPublic
from services.mobile_service import MobileMapService 
from shapely.geometry import mapping
from geoalchemy2.shape import to_shape
from typing import Optional, List, Dict
import uuid

router = APIRouter()


@router.get("/areas")
def get_mobile_areas(db: Session = Depends(get_db)):
    """All areas with boundary GeoJSON — for rendering polygons in flutter_map"""
    areas = db.query(Area).all()
    return [
        {
            "area_id": str(a.area_id),
            "area_name": a.area_name,
            "center_latitude": a.center_latitude,
            "center_longitude": a.center_longitude,
            "boundary": mapping(to_shape(a.boundary_coordinates)) if a.boundary_coordinates else None,
        }
        for a in areas
    ]


# ─── New Heavy Lifter Map Dynamic Tiles Endpoint ────────────────────────────
@router.get("/areas/{area_id}/tiles")
def get_mobile_area_tiles(
    area_id: str,
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    week: int = Query(4, ge=1, le=4),
    threshold: int = Query(2, ge=1),
    db: Session = Depends(get_db)
):
    """
    The Heavy Lifter Endpoint. Offloads dynamic grouping calculations 
    to the database layer to dramatically optimize mobile payload sizing.
    """
    try:
        return MobileMapService.calculate_hex_tiles(
            db=db,
            area_id=area_id,
            month=month,
            year=year,
            week=week,
            threshold=threshold
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID Format configuration context")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Hex-Binning pipeline engine error: {str(e)}")


# ─── New On-Demand High-Zoom Batch Metadata Endpoint ───────────────────────
@router.post("/images/batch")
def get_mobile_batch_images(payload: Dict[str, List[str]], db: Session = Depends(get_db)):
    """
    On-demand collection resolution loader. Fetches complete file asset blocks
    only when a targeted coordinate cell ring is activated on-screen.
    """
    image_ids = payload.get("image_ids", [])
    try:
        return MobileMapService.fetch_batch_images(db=db, image_ids=image_ids)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tracking identification UUID array lists")


@router.get("/areas/{area_id}/summary")
def get_mobile_area_summary(area_id: str, db: Session = Depends(get_db)):
    """Quick stats for a selected area — for the Flutter drawer/bottom sheet"""
    try:
        area_uuid = uuid.UUID(area_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Area ID format")

    area = db.query(Area).filter(Area.area_id == area_uuid).first()
    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    from models.image import Image as ImageModel
    from models.drone_flight_log import DroneFlightLog

    total_images = (
        db.query(ImageModel)
        .join(DroneFlightLog, ImageModel.flight_id == DroneFlightLog.flight_id)
        .filter(DroneFlightLog.area_id == area_uuid)
        .count()
    )

    total_flights = (
        db.query(DroneFlightLog)
        .filter(DroneFlightLog.area_id == area_uuid)
        .count()
    )

    return {
        "area_id": str(area.area_id),
        "area_name": area.area_name,
        "total_images": total_images,
        "total_flights": total_flights,
        "center_latitude": area.center_latitude,
        "center_longitude": area.center_longitude,
    }

    
@router.get("/areas/report", response_model=List[ReportPublic])
def get_all_reports(
    status: Optional[str] = None,
    area_id: Optional[str] = None,
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Report)
    if status:
        query = query.filter(Report.status == status)
    if area_id:
        try:
            query = query.filter(Report.area_id == uuid.UUID(area_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Area UUID parameter formatting")
            
    return query.order_by(Report.timestamp.desc()).limit(limit).offset(offset).all()