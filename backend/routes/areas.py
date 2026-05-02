from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models.area import Area
from pydantic import BaseModel
from typing import Optional
import uuid
from routes.helper.utils import AreaCreate
from geoalchemy2.shape import to_shape, from_shape
from shapely.geometry import shape, mapping

router = APIRouter()



@router.post("/create")
def create_area(data: AreaCreate, db: Session = Depends(get_db)):
    poly_shape = shape(data.boundary_coordinates)
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
def get_all_areas(db: Session = Depends(get_db)):
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
import uuid

@router.delete("/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_area(area_id: uuid.UUID, db: Session = Depends(get_db)):
    area = db.query(Area).filter(Area.area_id == area_id).first()

    if not area:
        raise HTTPException(status_code=404, detail="Area not found")

    db.delete(area)
    db.commit()

    return {"message": "Area deleted successfully"}
    
