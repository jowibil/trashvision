"""
Automated critical-area alerts — pure SQL + string template, NO LLM.

Severity lives ONCE here, on the MAP's ruler: an area's CCI (K · detections ÷
geodesic area, K = 20 — the very number MapView's header chip prints). The
alerts pipeline, routes/logs.py (hotspot zones) and the chatbot's live-data
block all call severity_from_cci, so a hotspot badge, an alert message and a
coloured hex cell can no longer disagree.

Counts are still reported ("63 detections") — they are just not the ruler any
more. A raw row count says nothing on its own: 51 items is nothing across
20,000 m² and severe on a 300 m² plot. (History: the old count thresholds
>50/>20/>5 were written for citizen-report volume and rated a 2,000 m² area
Critical at the density the map calls "Very low" — a 40× disagreement between
two surfaces that must agree.)

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
import calendar
import logging
from datetime import date, datetime, timezone

from sqlalchemy import func, extract, text
from sqlalchemy.orm import Session

from models.area import Area
from models.detection import Detection
from models.insight import Insight

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Severity — ONE scale, the map's CCI. Do NOT change these numbers without
# changing web/src/services/hooks/useHexbins.ts (DRONE_K_FACTOR, classifyCci)
# and mobile/lib/config/theme.dart (getCciColor) in the same commit: they are
# the same ruler, and the whole point is that no surface can disagree.
# ---------------------------------------------------------------------------

# CCI scaling coefficient. Mirrors DRONE_K_FACTOR on the web (and the phone's
# copy) — do NOT introduce a second K.
CCI_K_FACTOR = 20.0

# The map's five CCI bands, collapsed onto the four alert levels. The two
# clean bands both read Low: an alert whose message ends in "no cleanup
# sweep needed" would be noise.
#   CCI ≤ 2   "Very low"  → Low
#   CCI ≤ 5   "Low"       → Low
#   CCI ≤ 10  "Moderate"  → Medium
#   CCI ≤ 20  "High"      → High
#   CCI > 20  "Very high" → Critical
CCI_LOW_MAX = 5.0
CCI_MODERATE_MAX = 10.0
CCI_HIGH_MAX = 20.0


def severity_from_cci(cci: float | None) -> str:
    """Alert level for an area-level CCI — the map chip's number.

    Same band edges as classifyCci, so a hotspot badge reading "High" sits on
    the map in a cell coloured "High". None (an area with no drawn boundary
    has no denominator, hence no density) can never be rated dangerous: Low.
    """
    if cci is None:
        return "Low"
    if cci > CCI_HIGH_MAX:
        return "Critical"
    if cci > CCI_MODERATE_MAX:
        return "High"
    if cci > CCI_LOW_MAX:
        return "Medium"
    return "Low"


def _area_size_expr(column: str) -> str:
    """ST_Area(...::geography) for a boundary column, in m².

    Boundaries predating the srid=4326 column constraint exist with SRID 0,
    and ::geography raises on those ("Only lon/lat coordinate systems are
    supported"). SRID 0 is re-tagged as WGS84 (what the Leaflet drawer emits)
    and any other SRID is transformed — the same normalization
    mobile_service._BOUNDARY_SELECT applies for the hex grid.
    """
    return (
        "ST_Area(CASE WHEN ST_SRID({c}) = 0 THEN ST_SetSRID({c}, 4326) "
        "ELSE ST_Transform({c}, 4326) END::geography)"
    ).format(c=column)


_AREA_SIZE_SQL = (
    "SELECT {expr} AS area_m2 FROM areas "
    "WHERE area_id = :area_id AND boundary_coordinates IS NOT NULL"
)


def area_size_m2(db: Session, area_id) -> float | None:
    """Geodesic area of one drawn area, in m². None = no usable boundary.

    None is a real state (not an error): without a polygon there is no
    denominator, so no CCI exists and the area rates Low.
    """
    row = db.execute(
        text(_AREA_SIZE_SQL.format(expr=_area_size_expr("boundary_coordinates"))),
        {"area_id": area_id},
    ).first()
    if row is None or row.area_m2 is None:
        return None
    area_m2 = float(row.area_m2)
    return area_m2 if area_m2 > 0 else None


def area_cci(db: Session, area_id, detection_count: int | None = None) -> float | None:
    """Area-level CCI = K · detections ÷ geodesic area.

    Identical to the arithmetic behind MapView's header chip, which is what
    makes an alert and the map the same statement about the same place.
    """
    area_m2 = area_size_m2(db, area_id)
    if area_m2 is None:
        return None
    count = count_detections(db, area_id) if detection_count is None else detection_count
    return CCI_K_FACTOR * count / area_m2


# Severity ranking used for the "worsened" comparison: the dedup rule holds
# until the LEVEL moves, so density wiggles inside one band create no new row.
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

    Without the year/month filter this is the all-time count: the numerator
    of the area's CCI. It is reported to users as context ("63 detections"),
    never used as the severity ruler on its own.
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
    cci: float | None,
    top_type: str | None,
    top_type_pct: float | None,
    change_pct: float | None,
) -> str:
    """The plain template (brief §3c). Edge cases handled:

    - zero detections: the facts say zero, no invented trend;
    - no previous month (change_pct None): comparison omitted entirely;
    - top type None/0%: the type clause is dropped, never rendered empty;
    - no area boundary (cci None): severity is Low by construction and the
      CCI clause is omitted rather than printed as 0.
    """
    if detection_count <= 0:
        return f"{area_name} is now {severity}: 0 detections. No cleanup sweep needed yet."

    # The CCI is what produced the severity, so it is printed with it: without
    # it, "Critical: 51 detections" reads like a count threshold and invites
    # the operator to compare it against an area ten times the size.
    parts = [f"{area_name} is now {severity}: {detection_count} detections"]
    if cci is not None:
        parts.append(f"CCI {cci:.2f}")
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
    # Severity is the area's CCI — density, the same ruler the map colours
    # hexes and its header chip with. The count is a numerator, not a verdict.
    cci = area_cci(db, area.area_id, detection_count)
    severity = severity_from_cci(cci)
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
            area.area_name,
            severity,
            detection_count,
            cci,
            top_type,
            top_type_pct,
            change_pct,
        ),
    )
    db.add(insight)
    db.commit()
    logger.info(
        "Alert created for area %s (severity %s, CCI %s, count %s)",
        area.area_id,
        severity,
        f"{cci:.2f}" if cci is not None else "n/a",
        detection_count,
    )
    return insight


def area_cci_snapshot(db: Session) -> dict:
    """Every area's CCI for the latest surveyed month — the dashboard panel.

    The window is the newest month any detection is DATED, not the current
    calendar month: detections carry EXIF shutter time, so a re-processed or
    late-uploaded mission lands in its survey month, and the current month is
    empty until a new survey happens. A "this month" panel read 0 for every
    area between missions (November 2026 had none) and looked identical to a
    clean coast.

    CCI = K · detections ÷ geodesic area: the SAME arithmetic as area_cci()
    and the map's hex cells, so a bar here can never disagree with a map chip,
    a hotspot badge or an alert. One query for all areas (the per-area helper
    would be N queries on every dashboard load).

    Two honest Nones, both rendered as words rather than a zero bar:
      - area_m2/cci None: no drawn boundary, so no denominator, so no rating;
      - detection_count 0: this area was not surveyed in the window — that is
        not the same statement as "surveyed and clean".
    """
    latest = db.query(func.max(Detection.timestamp)).scalar()
    if latest is None:
        return {"window": None, "areas": []}

    year, month = latest.year, latest.month
    rows = db.execute(
        text(
            f"""
            SELECT a.area_id, a.area_name,
                   {_area_size_expr('a.boundary_coordinates')} AS area_m2,
                   count(d.detection_id) AS detection_count
            FROM areas a
            LEFT JOIN detections d
                   ON d.area_id = a.area_id
                  AND EXTRACT(YEAR FROM d.timestamp) = :year
                  AND EXTRACT(MONTH FROM d.timestamp) = :month
            GROUP BY a.area_id, a.area_name, a.boundary_coordinates
            """
        ),
        {"year": year, "month": month},
    ).all()

    areas = []
    for row in rows:
        area_m2 = float(row.area_m2) if row.area_m2 else None
        count = int(row.detection_count or 0)
        areas.append(
            {
                "area_id": str(row.area_id),
                "area_name": row.area_name,
                "area_m2": area_m2,
                "detection_count": count,
                "cci": (CCI_K_FACTOR * count / area_m2) if area_m2 else None,
            }
        )

    # Densest first — the point of the panel. Unrated areas (no boundary) last,
    # then by count so equal densities keep a stable, non-flapping order.
    areas.sort(key=lambda a: (a["cci"] is None, -(a["cci"] or 0.0), -a["detection_count"], a["area_name"]))

    # Detections that fell outside every drawn area cannot be rated at all;
    # they are reported as a footnote instead of a bar that would drag the
    # comparison toward "everything is clean".
    unassigned = int(
        db.query(func.count(Detection.detection_id))
        .filter(
            Detection.area_id.is_(None),
            extract("year", Detection.timestamp) == year,
            extract("month", Detection.timestamp) == month,
        )
        .scalar()
        or 0
    )

    return {
        "window": {
            "year": year,
            "month": month,
            "label": f"{calendar.month_name[month]} {year}",
            "latest_survey_date": latest.date().isoformat(),
            "unassigned_detections": unassigned,
        },
        "areas": areas,
    }


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

    # Raw SQL because every row needs its area's geodesic size — the CCI
    # denominator — and PostGIS' ::geography cast has no ORM equivalent.
    per_area = db.execute(
        text(
            f"""
            SELECT a.area_name,
                   count(d.detection_id) AS cnt,
                   {_area_size_expr('a.boundary_coordinates')} AS area_m2
            FROM areas a
            LEFT JOIN detections d ON d.area_id = a.area_id
            GROUP BY a.area_id, a.area_name, a.boundary_coordinates
            """
        )
    ).all()
    lines = []
    sweep_needed = 0
    for row in sorted(per_area, key=lambda r: (-r.cnt, r.area_name)):
        count = int(row.cnt or 0)
        cci = CCI_K_FACTOR * count / float(row.area_m2) if row.area_m2 else None
        severity = severity_from_cci(cci)
        if severity in ("High", "Critical"):
            sweep_needed += 1
        density = f", CCI {cci:.2f}" if cci is not None else ""
        lines.append(f"{row.area_name} {severity} ({count}{density})")

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
