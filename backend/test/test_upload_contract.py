"""Upload contract canary — no database, no network, no HTTP client.

Guards the parts of POST /flights/upload-batch that drift silently: the form
field names the portal sends, the cap settings the handler reads, and the pure
helpers the caps and the batch id depend on.

It is a canary, not an oracle: when the contract changes on purpose, change
this file in the same commit.
"""

import inspect
import sys
from pathlib import Path

# `ml` lives at the repo root and routes.flights imports it transitively
# (routes -> services.detection_service -> ml.detect).
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from config import settings  # noqa: E402
from routes import flights  # noqa: E402
from routes.helper.utils import FlightStats  # noqa: E402
from services.geo_assign import resolve_areas_for_points  # noqa: E402


def test_cap_settings_exist_and_are_sane():
    assert settings.MAX_FILES_PER_REQUEST > 0
    assert settings.MAX_FILE_BYTES > 0
    # A single file must be allowed to reach the per-file cap.
    assert settings.MAX_FILE_BYTES <= settings.MAX_UPLOAD_BYTES
    # The documented demo batch (200 real frames at ~8 MB) must pass.
    assert 200 * 8 * 1024 * 1024 < settings.MAX_UPLOAD_BYTES
    # One-frame-at-a-time writing is the volume-safe default.
    assert settings.MAX_CONCURRENT_UPLOADS >= 1


def test_form_contract_is_unchanged():
    params = inspect.signature(flights.upload_flight_batch).parameters
    # A required field the server silently discards is a lie in the form; these
    # are the fields the portal actually posts.
    for name in ("files", "flight_date", "pilot_name", "notes"):
        assert name in params, f"{name} disappeared from the upload form contract"
    # area_id stays OPTIONAL: "auto-detect from GPS" omits it on purpose.
    assert "area_id" in params
    # v1 never appends: the field must not exist before the feature does.
    assert "append_to_flight_id" not in params


def test_cap_rejection_shape_is_renderable():
    exc = flights._cap_error("too_many_files", "too many", limit=3, received=4)
    assert exc.status_code == 413
    assert exc.detail["error"] == "too_many_files"
    assert exc.detail["limit"] == 3
    assert exc.detail["received"] == 4


def test_flight_stats_defaults_to_zero():
    stats = FlightStats()
    assert stats.images_total == 0
    assert stats.images_pending == 0
    assert stats.detections_total == 0
    # EXIF shutter time of no frames yet — never an insert clock.
    assert stats.last_capture_at is None


def test_bulk_area_resolver_ignores_untagged_points():
    # The (0.0, 0.0) placeholder from EXIF-less frames must never resolve to a
    # boundary, and an empty batch must not query at all (db=None proves it).
    assert resolve_areas_for_points(None, []) == {}
    assert resolve_areas_for_points(None, [(None, None), (0.0, 0.0)]) == {}
