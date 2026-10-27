from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from dependency import require_public, require_role
from models.area import Area
from models.insight import Insight
from models.user import User

router = APIRouter()

# READS are public (product decision 2026-10: the web portal browses
# logged-out via "Open Forecast", and the mobile app shows the in-app alert
# card to its users — no personal data in a templated aggregate). Mutations
# (acknowledge) stay admin-only.


def _alert_payload(insight: Insight, area_name: str | None) -> dict:
    return {
        "insight_id": str(insight.insight_id),
        "kind": insight.kind,
        "area_id": str(insight.area_id) if insight.area_id else None,
        "area_name": area_name,
        "severity": insight.severity,
        "detection_count": insight.detection_count,
        "top_type": insight.top_type,
        "top_type_pct": insight.top_type_pct,
        "change_pct": insight.change_pct,
        "message": insight.message,
        "created_at": insight.created_at.isoformat() if insight.created_at else None,
    }


@router.get("/")
def get_active_insights(db: Session = Depends(get_db), _user=Depends(require_public())):
    """
    What the banners/cards need in one call: every UNACKNOWLEDGED alert
    (newest first) + the latest monthly digest (or null). Acknowledged rows
    are history — the pipeline keeps them for audit but delivery hides them.
    """
    rows = (
        db.query(Insight, Area.area_name)
        .outerjoin(Area, Insight.area_id == Area.area_id)
        .filter(Insight.acknowledged_at.is_(None))
        .order_by(Insight.created_at.desc())
        .all()
    )
    alerts = [_alert_payload(insight, name) for insight, name in rows if insight.kind == Insight.ALERT]
    digest_payload = next(
        (_alert_payload(insight, None) for insight, _ in rows if insight.kind == Insight.DIGEST),
        None,
    )
    return {"alerts": alerts, "digest": digest_payload}


@router.post("/{insight_id}/acknowledge")
def acknowledge_insight(
    insight_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """Admin action: clear one insight from all delivery surfaces (banner,
    map banner, mobile card). Keeps the row (audit trail) but stamps it."""
    from uuid import UUID

    try:
        parsed = UUID(insight_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid insight UUID format")

    insight = db.get(Insight, parsed)
    if insight is None:
        raise HTTPException(status_code=404, detail="Insight not found")
    if insight.acknowledged_at is None:
        from datetime import datetime, timezone

        insight.acknowledged_at = datetime.now(timezone.utc)
        insight.acknowledged_by = admin.user_id
        db.commit()
    return {"status": "acknowledged", "insight_id": insight_id}
