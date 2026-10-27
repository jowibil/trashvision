"""
Upload temp-file reaper.

Stage B (drone ingest) cleans its temp file per task, but any crashed or
restarted worker leaks that file forever — on a long-lived production box
that's a silent disk exhaustion. A dependency-free daemon thread sweeps
backend/temp every hour and deletes files older than TEMP_FILE_MAX_AGE_HOURS
(same pattern as the insights sweep thread: the repo has no job scheduler
and none was added).
"""
import logging
import os
import threading
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# Same directory routes/flights.py writes to (its TEMP_UPLOAD_DIR = "temp"
# is CWD-relative, i.e. backend/temp when the app runs from backend/); this
# module derives it from its own location so a process started anywhere on
# the box still sweeps the right directory.
TEMP_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "temp"
_SWEEP_INTERVAL_S = 60 * 60  # hourly

_stop = threading.Event()


def _clean_once(max_age_seconds: float) -> int:
    removed = 0
    try:
        now = time.time()
        for entry in os.scandir(TEMP_UPLOAD_DIR):
            try:
                # FileNotFoundError only means the worker cleaned the file
                # between the scan and the stat — never worth dying for.
                if not entry.is_file(follow_symlinks=False):
                    continue
                if now - entry.stat().st_mtime > max_age_seconds:
                    os.remove(entry.path)
                    removed += 1
            except FileNotFoundError:
                continue
            except OSError as e:
                logger.warning("Temp reaper skipped %s: %s", entry.path, e)
    except FileNotFoundError:
        pass  # no temp dir yet — nothing uploaded on this box
    except OSError as e:
        logger.warning("Temp reaper could not scan %s: %s", TEMP_UPLOAD_DIR, e)
    return removed


def _reaper_loop(max_age_seconds: float):
    # Wait one interval before the FIRST sweep: a process started minutes ago
    # may legitimately have in-flight files younger than the age limit, and
    # the cadence is what keeps the directory bounded long-term.
    if not _stop.wait(_SWEEP_INTERVAL_S):
        while not _stop.is_set():
            removed = _clean_once(max_age_seconds)
            if removed:
                logger.info("Temp reaper removed %d stale file(s)", removed)
            _stop.wait(_SWEEP_INTERVAL_S)


def start_temp_cleaner(max_age_hours: int) -> None:
    """Start the daemon reaper thread. Idempotent: an accidental double
    import must not spawn two loops fighting over the same files."""
    if getattr(start_temp_cleaner, "_started", False):
        return
    start_temp_cleaner._started = True
    threading.Thread(
        target=_reaper_loop,
        args=(max_age_hours * 3600,),
        daemon=True,
        name="temp-upload-reaper",
    ).start()
    logger.info(
        "Temp reaper started: sweeps %s hourly, deletes files older than %dh",
        TEMP_UPLOAD_DIR,
        max_age_hours,
    )
