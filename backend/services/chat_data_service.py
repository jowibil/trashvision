"""
Chatbot live data block (brief Task 4) — SQL facts, never LLM-computed.

get_chat_reply injects this per request so Gemini explains REAL numbers. All
counts/severities reuse the Task-3 helpers in insights_service
(count/severity/top-type + month-over-month change), so the chatbot and the
alerts can never disagree — single source of truth, per the brief.

Block shape (compact, worst first):
    LIVE DATA (as of 2026-10-27):
    - Shoreline_North: 63 detections, severity Critical, top type plastic
      (41.0%), +18% vs last month
    - Shoreline_South: 12 detections, severity Medium, top type styrofoam

Selection rule (brief §Task 4: "top 3 to 5 areas, plus any area the user
mentions by name"): the 5 worst areas by severity rank then detection count,
plus any area whose name the user's message mentions (case-insensitive).
Areas the user names but that don't exist are NOT fabricated — they simply
don't appear in the block, and the prompt rule says to say data is missing.

Cache: the block is rebuilt at most every 90s (the brief allows 1–2 min).
"""
import logging
import re
import time
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.area import Area
from models.detection import Detection
from services.insights_service import (
    _previous_month,
    count_detections,
    severity_from_count,
    top_waste_type,
)

logger = logging.getLogger(__name__)

# How many worst areas always ship in the block (brief: "top 3 to 5").
TOP_N_AREAS = 5

# The 1–2 minute TTL from the brief, split-difference. Only the aggregate
# block is cached; per-request name-mentions are always fresh queries.
BLOCK_TTL_SECONDS = 90


def _fetch_area_facts(db: Session, names: list[Area.area_name] | None = None):
    """Facts for the given area names, or every area with any detections."""
    query = (
        db.query(Area, func.count(Detection.detection_id).label("cnt"))
        .outerjoin(Detection, Detection.area_id == Area.area_id)
        .group_by(Area.area_id, Area.area_name)
    )
    if names:
        lowered = [n.lower() for n in names]
        query = query.filter(func.lower(Area.area_name).in_(lowered))
    return query.order_by(func.count(Detection.detection_id).desc()).all()


def _area_line(db: Session, area: Area) -> str | None:
    """One compact '-Name: ...' line following the brief's example format."""
    area_id = area.area_id
    detection_count = count_detections(db, area_id)
    severity = severity_from_count(detection_count)
    top_type, top_type_pct = top_waste_type(db, area_id)

    parts = [f"{area.area_name}: {detection_count} detections, severity {severity}"]
    if top_type and (top_type_pct or 0) > 0:
        parts.append(f"top type {top_type} ({top_type_pct}%)")

    latest_ts = (
        db.query(func.max(Detection.timestamp)).filter(Detection.area_id == area_id).scalar()
    )
    if latest_ts is not None:
        prev_year, prev_month = _previous_month(latest_ts.year, latest_ts.month)
        prev_count = count_detections(db, area_id, prev_year, prev_month)
        this_month = count_detections(db, area_id, latest_ts.year, latest_ts.month)
        if prev_count > 0:
            change_pct = round(((this_month - prev_count) / prev_count) * 100, 1)
            parts.append(f"{change_pct:+.0f}% vs last month")

    return ", ".join(parts)


def build_live_data_block(db: Session, user_message: str) -> str:
    """The LIVE DATA string to inject into this request's system prompt.

    Name-mention matching: word-boundary regex over the message so
    "North" doesn't match "Northside" (area names are single tokens in
    practice, but the guard costs nothing). Areas with zero detections
    still appear (so the model can say "0, clean"), ranked above the
    always-on worst-five only if explicitly mentioned.
    """
    mentioned: list[Area] = []
    names = [row for row, in db.query(Area.area_name).all()]
    for name in names:
        if isinstance(name, str) and re.search(
            rf"\b{re.escape(name.lower())}\b", user_message.lower()
        ):
            mentioned.append(
                db.query(Area).filter(Area.area_name == name).first()
            )
    mentioned = [a for a in mentioned if a is not None]

    block = [f"LIVE DATA (as of {datetime.now(timezone.utc).date().isoformat()}):"]

    # Mentioned areas first (fresh data — not the 90s cache), then the
    # worst TOP_N_AREAS. Dedup so a mentioned area isn't listed twice.
    seen_ids: set[int] = set()
    for area in mentioned:
        line = _area_line(db, area)
        if line:
            block.append(f"- {line}")
            seen_ids.add(area.area_id)

    for area_row in _fetch_area_facts(db):
        area = area_row[0]
        if area.area_id in seen_ids:
            continue
        if len(seen_ids) >= TOP_N_AREAS + len(mentioned):
            break
        line = _area_line(db, area)
        if line:
            block.append(f"- {line}")
            seen_ids.add(area.area_id)

    block.append("Use ONLY these numbers when answering about detection data;")
    block.append("if a user asks about an area not listed here, say you don't have that data.")
    return "\n".join(block)


class _BlockCache:
    """Process-local cache of the always-on part of the block (worst five).

    The mentioned-area section is appended per request on top of the cached
    prefix. `logger` guard: a DB outage must not take the chat endpoint
    down — get_chat_reply falls back to no block instead.
    """

    def __init__(self) -> None:
        self._cached_at: float = 0.0
        self._cached_lines: list[str] = []

    def get_worst_lines(self, db: Session) -> list[str]:
        now = time.monotonic()
        if now - self._cached_at > BLOCK_TTL_SECONDS:
            try:
                lines = []
                for area_row in _fetch_area_facts(db):
                    if len(lines) >= TOP_N_AREAS:
                        break
                    line = _area_line(db, area_row[0])
                    if line:
                        lines.append(line)
                self._cached_lines = lines
                self._cached_at = now
            except Exception:
                logger.exception("Chat live-data build failed; serving staleness")
                # keep serving whatever we last built (may be empty)
        return self._cached_lines


_cache = _BlockCache()
