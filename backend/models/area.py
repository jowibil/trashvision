from sqlalchemy import Column, String, Text, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base
from geoalchemy2 import Geometry
import uuid

class Area(Base):
    __tablename__ = "areas"

    area_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    area_name = Column(String, nullable=False)
    boundary_coordinates = Column(Geometry('POLYGON', srid=4326))
    description = Column(Text)

    center_latitude = Column(Float)
    center_longitude = Column(Float)

    detections = relationship("Detection", back_populates="area")
    reports = relationship("Report", back_populates="area")
    trash_logs = relationship("TrashLog", back_populates="area")
    flights = relationship("DroneFlightLog", back_populates="area")