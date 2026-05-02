from sqlalchemy import Column, String, Date, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base
import uuid

class DroneFlightLog(Base):
    __tablename__ = "drone_flight_logs"

    flight_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flight_date = Column(Date, nullable=False)
    pilot_name = Column(String, nullable=False)
    area_covered = Column(String)
    notes = Column(Text)
    area_id = Column(UUID(as_uuid=True), ForeignKey("areas.area_id"))

    area = relationship("Area", back_populates="flights")
    images = relationship("Image", back_populates="flight")