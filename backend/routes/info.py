import json
import logging
import os

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from dependency import require_public
from models.report import Report

# Shared numeric constants — served so the Info page never re-types a number
# the code already owns (brief A3). Severity bands are the CCI band edges
# insights_service.severity_from_cci uses (the map's ruler); stage params are
# the real DBSCAN callsites; hex sizing is the same clamp the hex grid applies.
from services.insights_service import (
    CCI_HIGH_MAX,
    CCI_K_FACTOR,
    CCI_LOW_MAX,
    CCI_MODERATE_MAX,
)
from services.dbscan_service import (
    STAGE_A_EPS_METERS,
    STAGE_B_IOU_EPS,
    DBSCAN_MIN_SAMPLES,
)
from services.detection_service import STAGE_B_GSD_FACTOR, GSD_DEFAULT_METERS
from services.mobile_service import HEX_EDGE_MIN_M, HEX_EDGE_MAX_M, DEFAULT_EDGE_M

logger = logging.getLogger(__name__)

# README convention (backend/main.py): routes/ dir -> project root is two
# levels up. The manifest is a small static JSON in ml/ (gitignored export
# images stay outside the repo — only this file ships).
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(BACKEND_DIR))
MANIFEST_PATH = os.path.join(PROJECT_ROOT, "ml", "dataset_manifest.json")


def load_dataset_manifest() -> dict | None:
    """
    Reads ml/dataset_manifest.json once and caches it. Returns None (never
    raises) so the ML info endpoint still serves the verified-reports count
    if the manifest is missing or malformed — its absence badges an admin
    should see, not a crash.
    """
    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            cache["data"] = json.load(f)
    except (OSError, ValueError):
        logger.exception("Failed to read dataset manifest at %s", MANIFEST_PATH)
        cache["data"] = None
    return cache["data"]


# Module-level cache: counts are immutable for the deployed exporter.
cache: dict = {}


router = APIRouter()


# PUBLIC (product decision 2026-10: "Open Forecast" must work logged-out;
# this is a read-only static + aggregate, no personal data).
@router.get("/")
def get_ml_info(db: Session = Depends(get_db), _user=Depends(require_public())):
    return {
        "dataset": load_dataset_manifest(),
        "verified_reports_contributed": (
            db.query(func.count(Report.report_id)).filter(Report.status == "verified").scalar()
            or 0
        ),
        # Alert severity bands — the MAP's CCI scale, not detection counts.
        # "above N" = severity_from_cci fires the band when the area's CCI
        # (K · detections ÷ geodesic area → the map header chip's number)
        # exceeds N. k_factor is served so the page can show how a count and
        # an area become that CCI.
        "severity_bands": [
            {"name": "Critical", "above": CCI_HIGH_MAX},
            {"name": "High", "above": CCI_MODERATE_MAX},
            {"name": "Medium", "above": CCI_LOW_MAX},
            {"name": "Low", "above": -1},
        ],
        "cci_k_factor": CCI_K_FACTOR,
        # The two de-duplication stages' real parameters.
        "dedup": {
            "stage_a": {
                # Frames within this haversine radius share a cluster.
                "eps_meters": STAGE_A_EPS_METERS,
                "min_samples": DBSCAN_MIN_SAMPLES,
            },
            "stage_b": {
                # Same-frame duplicate boxes: overlap of at least this IoU is
                # one object. This is the LIVE rule (dbscan_service.cluster_boxes).
                "iou_threshold": STAGE_B_IOU_EPS,
                "min_samples": DBSCAN_MIN_SAMPLES,
                # LEGACY (pre-2026-11-11 rule): Stage B used to merge boxes
                # nearer than gsd_factor × gsd_meters. Every box in a frame
                # shares that frame's one GPS fix, so that radius clustered
                # each frame into a single detection — it is history now, kept
                # so the page can show what changed.
                "gsd_factor": STAGE_B_GSD_FACTOR,
                "gsd_meters": GSD_DEFAULT_METERS,
                "legacy": True,
            },
        },
        # Adaptive hex sizing clamps (spec: docs/algorithm_equations.md §2) — cell
        # edge derives from the drawn boundary's min dimension / 10, clamped
        # to these bounds; areas without a boundary use default_edge_m.
        "hex_grid": {
            "edge_min_m": HEX_EDGE_MIN_M,
            "edge_max_m": HEX_EDGE_MAX_M,
            "default_edge_m": DEFAULT_EDGE_M,
        },
    }
