from sqlalchemy import Column, String, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base
import uuid
from datetime import datetime, timezone


class ReportDetection(Base):
    """
    One raw YOLO box detected in a VERIFIED citizen report's photo.

    Deliberately a separate table from `detections` (brief D1): the drone
    pipeline's queries (hexbins, CCI, TrashLog counts, Dashboard) would all
    need to filter report rows out of `detections` forever — reusing it risks
    contaminating every drone metric with arbitrary-scale citizen photos.

    No DBSCAN/Stage-B clustering intentionally: its ε derives from drone GSD
    (2.5×GSD), which is meaningless for citizen photos of unknown distance
    (D5). All boxes `trash_detector.run_inference` returns are stored as-is;
    the model's own conf=0.25 cutoff is the only threshold (D7).

    Report detections NEVER feed CCI / hexbins / TrashLog rollups (D5) — the
    analytics boundary is enforced by simply not querying this table there.
    """
    __tablename__ = "report_detections"

    report_detection_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # DB-level cascade: reports bulk-deleted via query.delete() bypass ORM
    # cascades, so ondelete=CASCADE is what actually keeps rows consistent.
    report_id = Column(
        UUID(as_uuid=True),
        ForeignKey("reports.report_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    waste_type = Column(String, nullable=False)
    confidence_score = Column(Float, nullable=False)
    bbox_x1 = Column(Float, nullable=False)  # model input pixel space
    bbox_y1 = Column(Float, nullable=False)
    bbox_x2 = Column(Float, nullable=False)
    bbox_y2 = Column(Float, nullable=False)
    # Denormalized source photo URL — the report's photo may change or be
    # cleared later; boxes are evidence about the analyzed version.
    image_url = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    report = relationship("Report", back_populates="report_detections")
