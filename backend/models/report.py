from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Text, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base
import uuid
from datetime import datetime, timezone
from geoalchemy2 import Geometry
from sqlalchemy.ext.hybrid import hybrid_property
from geoalchemy2.shape import to_shape

report_status_enum = Enum('pending', 'verified', 'rejected', name='report_status')

class Report(Base): 
    __tablename__ = "reports"

    report_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    waste_type = Column(String, nullable=False)
    photo_url = Column(String)
    
    geom = Column(Geometry('POINT', srid=4326))
    
    timestamp = Column(DateTime, default=datetime.now(timezone.utc))
    status = Column(report_status_enum, default="pending")
    
    location_name = Column(String)
    description = Column(Text)

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"))
    area_id = Column(UUID(as_uuid=True), ForeignKey("areas.area_id"), nullable=True)

    user = relationship("User", back_populates="reports")
    area = relationship("Area", back_populates="reports")
    
    @property
    def reporter_name(self):
        return self.user.name if self.user else "Unknown"
    @property
    def latitude(self):
        return to_shape(self.geom).y if self.geom else None

    @property
    def longitude(self):
        return to_shape(self.geom).x if self.geom else None
    
    