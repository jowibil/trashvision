"""
Automated critical-area alerts — pure SQL + string template, NO LLM.

Severity thresholds live ONCE here and both the alerts pipeline and
routes/logs.py (hotspot zones) call severity_from_count — the brief's single
source of truth (log thresholds: >50 Critical, >20 High, >5 Medium, else
Low). Map coloring stays on the CCI scale and is untouched.

Cadence (product decision 2026-10-27):
  - Per flight: the affected flight's area is evaluated when Stage B
    finishes a frame (process_image_upload trigger).
  - Weekly: full sweep over every area (background thread, main.py).
  - Monthly: one templated digest row covering ALL areas, even unchanged
    ones (kind='digest'). Digests never trip the per-area dedup rule.

Alert rule: an alert is created when an area (a) is evaluated with NO prior
alert and is High-or-worse (first-run decision 2026-10-27), or (b) worsens
relative to its latest alert's severity. Same severity twice → no new row;
the unacknowledged alert sitting in the table IS the weekly reminder.
"""
import logging
from datetime import date, datetime, timezone

from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from models.area import Area
from models.detection import Detection
from models.insight import Insight

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Severity thresholds — the single source of truth. Do NOT change these
# without changing routes/logs.py's rendering contract together.
# ---------------------------------------------------------------------------

# Admin severity thresholds — the ONE definition (this module + routes/logs.py
# + routes/info.py read from here; brief Task 3 decision).
CRITICAL_COUNT_THRESHOLD = 50
HIGH_COUNT_THRESHOLD = 20
MEDIUM_COUNT_THRESHOLD = 5

def severity_from_count(count: int) -> str:
    """logs.py thresholds (>50 Critical, >20 High, >5 Medium, else Low).

    The numbers are named constants so routes/info.py can serve them to the
    Info page from the same source this function uses (never re-typed).
    """
    if count > CRITICAL_COUNT_THRESHOLD:
        return "Critical"
    if count > HIGH_COUNT_THRESHOLD:
        return "High"
    if count > MEDIUM_COUNT_THRESHOLD:
        return "Medium"
    return "Low"


# Severity ranking used for the "worsened" comparison (index, not the count:
# more detections in Low still stays Low — dedup holds until the LEVEL moves).
_SEVERITY_ORDER = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}

SEVERITIES = tuple(_SEVERITY_ORDER)

# Sweep interval for the background thread (weekly, per product decision).
SWEEP_INTERVAL_SECONDS = 7 * 24 * 60 * 60


def _previous_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def count_detections(
    db: Session, area_id, year: int | None = None, month: int | None = None
) -> int:
    """Detection rows for one area, optionally constrained to one month.

    Without the year/month filter this is the all-time count — the same
    number routes/logs.py feeds into severity_from_count for hotspot zones,
    which is exactly why alert severities and the Dashboard always agree.
    """
    query = db.query(func.count(Detection.detection_id)).filter(
        Detection.area_id == area_id
    )
    if year is not None and month is not None:
        query = query.filter(
            extract("year", Detection.timestamp) == year,
            extract("month", Detection.timestamp) == month,
        )
    return int(query.scalar() or 0)


def top_waste_type(db: Session, area_id) -> tuple[str | None, float | None]:
    """(top_type, share_pct) for one area's all-time detections.

    A tie is broken deterministically by type name (the same tie every run,
    so the message never flips between two equal types).
    """
    rows = (
        db.query(Detection.waste_type, func.count(Detection.detection_id).label("cnt"))
        .filter(Detection.area_id == area_id)
        .group_by(Detection.waste_type)
        .all()
    )
    if not rows:
        return None, None
    total = sum(r.cnt for r in rows)
    top = sorted(rows, key=lambda r: (-r.cnt, r.waste_type))[0]
    return top.waste_type, round((top.cnt / total) * 100, 1)


def build_alert_message(
    area_name: str,
    severity: str,
    detection_count: int,
    top_type: str | None,
    top_type_pct: float | None,
    change_pct: float | None,
) -> str:
    """The plain template (brief §3c). Edge cases handled:

    - zero detections: the facts say zero, no invented trend;
    - no previous month (change_pct None): comparison omitted entirely;
    - top type None/0%: the type clause is dropped, never rendered empty.
    """
    if detection_count <= 0:
        return f"{area_name} is now {severity}: 0 detections. No cleanup sweep needed yet."

    parts = [f"{area_name} is now {severity}: {detection_count} detections"]
    if top_type and (top_type_pct or 0) > 0:
        parts.append(f"mostly {top_type} ({top_type_pct}%)")
    if change_pct is not None:
        parts.append(f"{change_pct:+.0f}% vs last month")
    message = ", ".join(parts) + "."
    if severity in ("High", "Critical"):
        message += " A cleanup sweep is recommended."
    return message


def evaluate_area(db: Session, area: Area) -> Insight | None:
    """Evaluate one area and create an alert when the rule (module docstring)
    fires. Returns the created Insight or None (no alert this run)."""
    detection_count = count_detections(db, area.area_id)
    severity = severity_from_count(detection_count)
    top_type, top_type_pct = top_waste_type(db, area.area_id)

    # Change vs the previous calendar month of the most recent detection
    # activity (or "now" if none): areas with no data at all skip cleanly.
    latest_ts = db.query(func.max(Detection.timestamp)).filter(
        Detection.area_id == area.area_id
    ).scalar()
    if latest_ts is not None:
        prev_year, prev_month = _previous_month(latest_ts.year, latest_ts.month)
        prev_count = count_detections(db, area.area_id, prev_year, prev_month)
        this_month = count_detections(db, area.area_id, latest_ts.year, latest_ts.month)
        change_pct = (
            round(((this_month - prev_count) / prev_count) * 100, 1)
            if prev_count > 0
            else None  # no comparison available — omit, never fake 0%
        )
    else:
        change_pct = None

    latest_alert = (
        db.query(Insight)
        .filter(Insight.kind == Insight.ALERT, Insight.area_id == area.area_id)
        .order_by(Insight.created_at.desc())
        .first()
    )

    should_create = False
    if latest_alert is None:
        # First run: alert immediately at High-or-worse (2026-10-27 decision);
        # Medium/Low areas only get a baseline later IF they worsen.
        should_create = severity in ("High", "Critical")
    else:
        should_create = (
            _SEVERITY_ORDER[severity] > _SEVERITY_ORDER.get(latest_alert.severity or "Low", 0)
        )

    if not should_create:
        return None

    insight = Insight(
        kind=Insight.ALERT,
        area_id=area.area_id,
        severity=severity,
        detection_count=detection_count,
        top_type=top_type,
        top_type_pct=top_type_pct,
        change_pct=change_pct,
        message=build_alert_message(
            area.area_name, severity, detection_count, top_type, top_type_pct, change_pct
        ),
    )
    db.add(insight)
    db.commit()
    logger.info(
        "Alert created for area %s (severity %s, count %s)", area.area_id, severity, detection_count
    )
    return insight


def evaluate_all_areas(db: Session) -> list[Insight]:
    """Full sweep: every area, alerts per the dedup rule. Returns new alerts."""
    created: list[Insight] = []
    for area in db.query(Area).all():
        try:
            insight = evaluate_area(db, area)
            if insight is not None:
                created.append(insight)
        except Exception:
            db.rollback()
            # One broken area must never block the sweep (or the thread).
            logger.exception("Alert evaluation failed for area %s", area.area_id)
    return created


def build_monthly_digest(db: Session) -> Insight:
    """The monthly templated digest over ALL areas, including unchanged ones.

    One row per month (kind='digest', area_id/severity NULL). Created only if
    this month has no digest yet — the dedup rule applies to digests too.
    """
    now = datetime.now(timezone.utc)
    existing = (
        db.query(Insight)
        .filter(
            Insight.kind == Insight.DIGEST,
            extract("year", Insight.created_at) == now.year,
            extract("month", Insight.created_at) == now.month,
        )
        .first()
    )
    if existing is not None:
        return existing

    total = int(db.query(func.count(Detection.detection_id)).scalar() or 0)

    per_area = (
        db.query(Area.area_name, func.count(Detection.detection_id).label("cnt"))
        .outerjoin(Detection, Detection.area_id == Area.area_id)
        .group_by(Area.area_id, Area.area_name)
        .all()
    )
    lines = []
    sweep_needed = 0
    for row in sorted(per_area, key=lambda r: (-r.cnt, r.area_name)):
        severity = severity_from_count(int(row.cnt))
        if severity in ("High", "Critical"):
            sweep_needed += 1
        lines.append(f"{row.area_name} {severity} ({row.cnt})")

    message = (
        f"Monthly digest ({now.strftime('%B %Y')}): {total} detections total. "
        + " · ".join(lines)
        + f". {sweep_needed} area(s) need a cleanup sweep."
        if lines
        else f"Monthly digest ({now.strftime('%B %Y')}): {total} detections total. No surveyed areas."
    )

    digest = Insight(
        kind=Insight.DIGEST,
        area_id=None,
        severity=None,
        detection_count=total,
        top_type=None,
        top_type_pct=None,
        change_pct=None,
        message=message,
    )
    db.add(digest)
    db.commit()
    return digest


def run_sweep(db: Session) -> None:
    """The weekly sweep: alerts (dedup rule) + this month's digest."""
    evaluate_all_areas(db)
    build_monthly_digest(db)


def start_sweep_thread(session_factory):
    """Dependency-free scheduler (the repo has none — 2026-10-27 decision):
    one daemon thread, weekly interval, own DB session per run. Started once
    from main.py; dies with the process, never blocks startup."""
    import threading
    import time

    def _loop():
        while True:
            time.sleep(SWEEP_INTERVAL_SECONDS)
            db = session_factory()
            try:
                run_sweep(db)
            except Exception:
                logger.exception("Weekly insights sweep failed")
            finally:
                db.close()

    thread = threading.Thread(target=_loop, name="insights-sweep", daemon=True)
    thread.start()
    return thread
