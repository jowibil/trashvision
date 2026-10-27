from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from database import Base
import uuid
from datetime import datetime, timezone


class Insight(Base):
    """
    One templated (never LLM-computed) statement about an area's pollution
    level. Two kinds:
      - 'alert'  : per-area, created by the SQL + template pipeline when an
                   area crosses into High-or-worse severity or worsens from a
                   previous alert (dedup: no new alert for an area until its
                   severity changes). area_id is always set here.
      - 'digest' : the monthly roll-up (one per month), summarizing every
                   area — including unchanged ones. area_id/severity are NULL
                   on digest rows so nothing can mistake them for per-area
                   alerts.
    Severity strings come from services/insights_service.severity_from_count —
    the same thresholds routes/logs.py renders for hotspot zones.
    """
    __tablename__ = "insights"

    ALERT = "alert"
    DIGEST = "digest"

    insight_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # server_default must mirror the migration's DB default (7d91f0a2b3c4
    # created the column with server_default='alert'); a client-side-only
    # default here made autogenerate flag a permanent drift.
    kind = Column(String, nullable=False, default=ALERT, server_default=ALERT)

    # Index names mirror migration 7d91f0a2b3c4 exactly — under-declared
    # indexes made `alembic check` want to drop the DB's real ones every run.
    __table_args__ = (
        Index('ix_insights_area_created', 'area_id', 'created_at'),
        Index('ix_insights_kind_created', 'kind', 'created_at'),
    )

    # NULL only on digest rows (the monthly all-areas summary).
    area_id = Column(UUID(as_uuid=True), ForeignKey("areas.area_id"), nullable=True)
    severity = Column(String, nullable=True)

    # Detections evaluated for THIS area (alerts); all-area total (digests).
    detection_count = Column(Integer, nullable=True)

    top_type = Column(String, nullable=True)
    top_type_pct = Column(Float, nullable=True)

    # % change in detections vs the previous calendar month. NULL means
    # "no comparison available" (no data in the prior month) — the message
    # omits the comparison then; it must NOT render as 0%.
    change_pct = Column(Float, nullable=True)

    message = Column(Text, nullable=False)

    # nullable=False mirrors the migration's NOT NULL (7d91f0a2b3c4); an
    # under-declared nullable made `alembic check` want to relax the live
    # column on every autogenerate.
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    acknowledged_at = Column(DateTime, nullable=True)
    acknowledged_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=True)

    area = relationship("Area", backref="insights")
