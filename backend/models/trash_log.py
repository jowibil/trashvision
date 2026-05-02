from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid
from datetime import datetime


class TrashLog(Base):
    __tablename__ = "trash_logs"

    log_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    waste_type = Column(String, nullable=False)
    detection_count = Column(Integer, default=0)
    report_count = Column(Integer, default=0)
    
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    last_updated = Column(DateTime, server_default=func.now())
    area_id = Column(UUID(as_uuid=True), ForeignKey("areas.area_id"))

    area = relationship("Area", back_populates="trash_logs")