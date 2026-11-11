from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from dependency import require_role, require_public
from models.area import Area
from pydantic import BaseModel
from typing import Optional
import uuid
from routes.helper.utils import AreaCreate
from geoalchemy2.shape import to_shape, from_shape
from shapely.geometry import shape, mapping
from services.geo_assign import find_overlapping_areas

router = APIRouter()

# SECURITY: area reads are PUBLIC (product decision 2026-10: the web portal
# browses the map without an account — "Open Forecast"; mobile map also reads
# these). Writes stay admin-only (web DrawArea/Settings pages).


@router.post("/create")
def create_area(
    data: AreaCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_role("admin")),
):
    poly_shape = shape(data.boundary_coordinates)

    # Guard rail: a boundary drawn over an existing area is refused, because
    # point assignment keeps the lowest area_id (services/geo_assign.py), so
    # the OTHER area would silently lose the overlap — a hole in its hex map
    # and an undercounted CCI. 409 carries the names so the portal can say
    # which area already covers this ground instead of a generic failure.
    conflict_names = find_overlapping_areas(db, mapping(poly_shape))
    if conflict_names:
        noun = "area" if len(conflict_names) == 1 else "areas"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "area_overlap",
                "message": (
                    f"Boundary overlaps the existing {noun} "
                    f"{', '.join(conflict_names)}. Redraw it so the same "
                    "ground is not covered twice."
                ),
                "overlapping_area_names": conflict_names,
            },
        )

    centroid = poly_shape.centroid
    
    area = Area(
        area_name=data.area_name,
        description=data.description,
        boundary_coordinates=from_shape(poly_shape, srid=4326),
        center_latitude=centroid.y,
        center_longitude=centroid.x
    )
    
    db.add(area)
    db.commit()
    db.refresh(area)
    
    return {
        "area_id": str(area.area_id),
        "area_name": area.area_name,
        "description": area.description,
        "center_latitude": area.center_latitude,
        "center_longitude": area.center_longitude
    }

@router.get("/")
def get_all_areas(
    db: Session = Depends(get_db),
    _user=Depends(require_public()),
):
    areas = db.query(Area).all()    
    return [
        {
            "area_id": str(a.area_id),
            "area_name": a.area_name,
            "description": a.description,
            "center_latitude": a.center_latitude,
            "center_longitude": a.center_longitude,
            "boundary": mapping(to_shape(a.boundary_coordinates)) if a.boundary_coordinates else None
        } 
        for a in areas
    ]

@router.delete("/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_area(
    area_id: uuid.UUID,
    db: Session = Depends(get_db),
    _admin=Depends(require_role("admin")),
):
    area = db.query(Area).filter(Area.area_id == area_id).first()

    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    db.delete(area)
    db.commit()

    return {"message": "Area deleted successfully"}
    
