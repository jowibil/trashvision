from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base
import uuid
from datetime import datetime, timezone

class Detection(Base):
    __tablename__ = "detections"

    detection_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flight_id = Column(UUID(as_uuid=True), ForeignKey("drone_flight_logs.flight_id"), nullable=False)
    area_id = Column(UUID(as_uuid=True), ForeignKey("areas.area_id"), nullable=True)
    image_url = Column(String, nullable=False)
    image_id = Column(UUID, ForeignKey("images.image_id"), nullable=True)
    waste_type = Column(String, nullable=False)
    confidence_score = Column(Float, nullable=False)
    
    
    bbox_x1 = Column(Float, nullable=False)
    bbox_y1 = Column(Float, nullable=False)
    bbox_x2 = Column(Float, nullable=False)
    bbox_y2 = Column(Float, nullable=False)
    
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    duplicate_count= Column(Integer, default=1, nullable=False)
    cluster_id = Column(String, nullable=True)

    flight = relationship("DroneFlightLog", back_populates="detections")
    area = relationship("Area", back_populates="detections")
    # Source frame this detection was inferred from (images.image_id).
    image = relationship("Image", back_populates="detections")