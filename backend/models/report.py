from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Text, Enum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base
import uuid
from datetime import datetime, timezone
from geoalchemy2 import Geometry
from sqlalchemy.ext.hybrid import hybrid_property
from geoalchemy2.shape import to_shape

report_status_enum = Enum('pending', 'verified', 'rejected', name='report_status')

# Per-report YOLO analysis state (report_inference_design.md): set by
# services/report_inference_service when the report is verified. 'pending'
# also covers pre-existing verified reports with no backfill (design D11).
analysis_status_enum = Enum(
    'pending', 'running', 'completed', 'failed', name='report_analysis_status'
)

class Report(Base): 
    __tablename__ = "reports"

    report_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    waste_type = Column(String, nullable=False)
    photo_url = Column(String)
    
    geom = Column(Geometry('POINT', srid=4326))
    
    timestamp = Column(DateTime, default=datetime.now(timezone.utc))
    status = Column(report_status_enum, default="pending")
    analysis_status = Column(analysis_status_enum, nullable=False, default="pending")
    
    location_name = Column(String)
    description = Column(Text)

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"))
    area_id = Column(UUID(as_uuid=True), ForeignKey("areas.area_id"), nullable=True)

    # Idempotency key: the mobile offline outbox generates a UUID per report
    # and resends it on every sync retry, so a crash-after-commit on the
    # server (or an answer lost in transit) can no longer produce duplicate
    # reports — POST /reports/ returns the existing row instead of re-inserting.
    # Idempotency key: the mobile offline outbox generates a UUID per report
    # and resends it on every sync retry, so a crash-after-commit on the
    # server (or an answer lost in transit) can no longer produce duplicate
    # reports — POST /reports/ returns the existing row instead of re-inserting.
    # The unique index is declared EXPLICITLY with its migration-given name
    # (9d2e4f6a8b0c created ux_reports_client_report_id) instead of unique=True,
    # whose auto-name drifts from the DB and made `alembic check` want to
    # churn (drop + recreate) the index on every autogenerate.
    client_report_id = Column(UUID(as_uuid=True), nullable=True)

    __table_args__ = (
        Index('ux_reports_client_report_id', 'client_report_id', unique=True),
    )

    user = relationship("User", back_populates="reports")
    area = relationship("Area", back_populates="reports")
    # Raw YOLO boxes for the analyzed photo (verified reports). ORM cascade
    # for normal deletes; the FK's ondelete=CASCADE is what keeps rows
    # consistent for query.delete() bulk deletes.
    report_detections = relationship(
        "ReportDetection", cascade="all, delete-orphan", back_populates="report"
    )
    
    @property
    def reporter_name(self):
        return self.user.name if self.user else "Unknown"
    @property
    def latitude(self):
        return to_shape(self.geom).y if self.geom else None

    @property
    def longitude(self):
        return to_shape(self.geom).x if self.geom else None
    
    