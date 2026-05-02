from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base
import uuid
from datetime import datetime
from geoalchemy2 import Geometry

class Detection(Base):
    __tablename__ = "detections"

    detection_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    waste_type = Column(String, nullable=False)
    confidence_score = Column(Float, nullable=False)
    
    geom = Column(Geometry('POINT', srid=4326))
    
    timestamp = Column(DateTime, default=datetime.utcnow)
    is_manual = Column(Boolean, default=False)
    
    image_id = Column(UUID(as_uuid=True), ForeignKey("images.image_id"))
    area_id = Column(UUID(as_uuid=True), ForeignKey("areas.area_id"))

    image = relationship("Image", back_populates="detections")
    area = relationship("Area", back_populates="detections")