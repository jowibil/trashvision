import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Boolean, Integer, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base

class ProcessingStatus(str, enum.Enum):
    # Values must match the Postgres enum processing_status exactly
    # {pending, processing, done, failed, duplicate_skipped}. The service
    # layer maps COMPLETED -> "done" via the DB value.
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "done"  # DB label is 'done'; Python-side name stays COMPLETED
    FAILED = "failed"
    DUPLICATE_SKIPPED = "duplicate_skipped"


class Image(Base):
    __tablename__ = "images"

    image_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    flight_id = Column(UUID(as_uuid=True), ForeignKey("drone_flight_logs.flight_id"), nullable=False)
    
    file_url = Column(String, nullable=False)
    asset_url = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    altitude = Column(Float, nullable=True)

    # Original-frame pixel dimensions, captured at upload time so clients can
    # scale bounding boxes without decoding the full-res image (OOM guard).
    image_width = Column(Integer, nullable=True)
    image_height = Column(Integer, nullable=True)
    
    filename = Column(String, nullable=False)

    captured_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    is_representative = Column(Boolean, default=True, nullable=False)
    cluster_id = Column(String, nullable=True)
    
    processing_status = Column(
        # values_callable: store/lookup the enum's .value strings (lowercase:
        # 'pending', 'completed', ...) instead of the default enum NAMES
        # ('PENDING', ...). The Postgres type processing_status is lowercase —
        # without this, reads of existing rows raise LookupError and writes
        # are rejected as invalid enum labels.
        SQLEnum(
            ProcessingStatus,
            name="processing_status",
            values_callable=lambda enum_cls: [m.value for m in enum_cls],
        ),
        default=ProcessingStatus.PENDING,
        nullable=False
    )

    flight = relationship("DroneFlightLog", back_populates="images")
    # Detections produced from this frame (detections.image_id -> images.image_id).
    detections = relationship("Detection", back_populates="image")