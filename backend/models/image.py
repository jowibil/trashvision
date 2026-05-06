from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base
import uuid
from datetime import datetime, timezone

processing_status_enum = Enum('pending', 'processing', 'done', 'failed', name='processing_status')


class Image(Base):
    __tablename__ = "images"

    image_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    file_url = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    captured_at = Column(DateTime, default=datetime.now(timezone.utc))
    
    latitude = Column(Float)
    longitude = Column(Float)
    altitude = Column(Float)
    
    processing_status = Column(processing_status_enum, default='pending')
    
    flight_id = Column(UUID(as_uuid=True), ForeignKey("drone_flight_logs.flight_id"))

    flight = relationship("DroneFlightLog", back_populates="images")
    detections = relationship("Detection", back_populates="image")