"""
Verified-report → YOLOv8 inference (report_inference_design.md, APPROVED).

When an admin verifies a citizen report, the photo runs through the existing
`trash_detector` and every raw box is persisted to `report_detections`
(individual table, design D1). Report detections NEVER feed CCI / hexbins /
TrashLog rollups (D5) — this table is only read by the report detail
surfaces.

Cadence & execution (D6): synchronous inside the verify PATCH, bounded by a
semaphore. The swap to background execution later is exactly the
`execute_analysis` seam (§4.2) — call sites and this module's body stay
identical, only the seam's body changes.
"""
import logging
import os
import threading
import tempfile
import uuid

from sqlalchemy.orm import Session

from ml.detect import trash_detector
from models.report import Report
from models.report_detection import ReportDetection

logger = logging.getLogger(__name__)

# Bounds concurrent model runs (model memory). Doubles as the concurrency
# guard if the service moves to background workers (D6).
MAX_CONCURRENT_ANALYSES = 2
_analysis_semaphore = threading.BoundedSemaphore(MAX_CONCURRENT_ANALYSES)

# Photo download budget — a slow/failing CDN must not hang the PATCH response.
_DOWNLOAD_TIMEOUT_S = 15


def _download_photo(photo_url: str) -> str:
    """Fetch the hosted report photo to a temp file. Returns the local path.

    Raises on network/HTTP failure — the caller turns that into
    analysis_status='failed' (design D3: model/image problems never block
    verification itself).
    """
    import requests

    response = requests.get(photo_url, timeout=_DOWNLOAD_TIMEOUT_S, stream=True)
    response.raise_for_status()

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=".jpg", prefix="report_analysis_"
        ) as tmp:
            tmp_path = tmp.name
            for chunk in response.iter_content(chunk_size=8192):
                tmp.write(chunk)
    except Exception:
        # Don't leak the partially-written file when the copy fails midway.
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
    return tmp_path


def report_detection_payloads(db: Session, report_id) -> list[dict]:
    """Serialization contract shared by the PATCH and GET report endpoints
    (identical wire shape, design §5)."""
    rows = (
        db.query(ReportDetection)
        .filter(ReportDetection.report_id == report_id)
        .order_by(ReportDetection.created_at)
        .all()
    )
    return [
        {
            "waste_type": row.waste_type,
            "confidence_score": row.confidence_score,
            "bbox_x1": row.bbox_x1,
            "bbox_y1": row.bbox_y1,
            "bbox_x2": row.bbox_x2,
            "bbox_y2": row.bbox_y2,
        }
        for row in rows
    ]


def execute_analysis(db: Session, report_id: str) -> str:
    """The async-transition seam (design §4.2). The sync path runs inline
    under the semaphore, reusing the CALLER's session (a FastAPI request
    session). The background variant later must open its OWN SessionLocal()
    here instead — never share a request session across threads.
    """
    with _analysis_semaphore:
        return _run_analysis(db, report_id)


def _run_analysis(db: Session, report_id: str) -> str:
    """One analysis run, idempotent per design §4.3:

    no-op when not verified / already running / already completed for this
    exact photo; otherwise delete-then-recreate all rows. NEVER raises for
    model/image problems — the returned status is the contract; verification
    success never depends on this outcome (D3).
    """
    # Row lock defeats double-click races (two rapid PATCHes serialize here;
    # the loser sees analysis_status='running' and no-ops).
    report = (
        db.query(Report)
        .filter(Report.report_id == report_id)
        .with_for_update()
        .first()
    )
    if report is None:
        logger.warning("Report analysis requested for missing report %s", report_id)
        return "pending"

    if report.status != "verified":
        return report.analysis_status or "pending"
    if report.analysis_status == "running":
        return "running"

    # Idempotency: 'completed' rows always store the photo they analyzed in
    # image_url — redo only when the photo changed. stored is None means the
    # clean-photo result (0 boxes, still 'completed' — valid); a crashed run
    # cannot leave completed-with-no-rows because 'running' is committed
    # before the delete.
    if report.analysis_status == "completed":
        if not report.photo_url:
            return "completed"
        stored = (
            db.query(ReportDetection.image_url)
            .filter(ReportDetection.report_id == report.report_id)
            .first()
        )
        if stored is None or stored[0] == report.photo_url:
            return "completed"  # nothing to redo for the same photo

    # Re-verify (rejected→verified, or re-click): previous rows go before new
    # ones land — no duplicate stacking even without any successful run.
    report.analysis_status = "running"
    db.query(ReportDetection).filter(
        ReportDetection.report_id == report.report_id
    ).delete(synchronize_session=False)
    db.commit()

    tmp_path: str | None = None
    try:
        if not report.photo_url:
            # No photo → nothing to analyze. 'completed' with zero boxes is
            # reserved for a clean photo (a real result); missing photo keeps
            # 'failed' semantics out of a data-quality gap: status stays
            # 'failed' so the UI shows 'AI analysis unavailable'.
            report.analysis_status = "failed"
            db.commit()
            return "failed"

        tmp_path = _download_photo(report.photo_url)
        boxes = trash_detector.run_inference(tmp_path)

        new_rows = [
            ReportDetection(
                report_id=report.report_id,
                waste_type=box["classification"],
                confidence_score=box["confidence_score"],
                bbox_x1=box["bounding_box"][0],
                bbox_y1=box["bounding_box"][1],
                bbox_x2=box["bounding_box"][2],
                bbox_y2=box["bounding_box"][3],
                image_url=report.photo_url,
            )
            for box in boxes
        ]
        db.add_all(new_rows)
        # 'completed' with ZERO boxes is a valid result (clean photo) — not
        # an error (design §4.3).
        report.analysis_status = "completed"
        db.commit()
        logger.info(
            "Report analysis completed for %s: %d box(es)",
            report_id,
            len(new_rows),
        )
    except Exception:
        db.rollback()
        # Re-acquire the lock before mutating again (the rollback releases it).
        report = (
            db.query(Report)
            .filter(Report.report_id == report_id)
            .with_for_update()
            .first()
        )
        if report is not None:
            # Verification already succeeded — analysis failing must NEVER
            # demote the report itself (D3).
            report.analysis_status = "failed"
            db.commit()
            logger.exception("Report analysis failed for %s", report_id)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)  # same temp discipline as detection_service

    return report.analysis_status if report is not None else "failed"


def run_report_analysis(db: Session, report_id: str) -> str:
    """Public entry point: runs inference for one verified report and returns
    the final analysis_status. Never raises for model/image problems —
    callers read the returned status."""
    return execute_analysis(db, report_id)
