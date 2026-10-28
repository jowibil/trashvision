import os
from pydantic_settings import BaseSettings
from pathlib import Path
env_path = Path(__file__).parent / ".env"

# Neon wiring (2026-10-28): the Neon CLI (`neon init` / `neon deploy`) writes
# its managed env vars to the repo-root .env.local — DATABASE_URL (pooled,
# for app runtime), DATABASE_URL_UNPOOLED (direct, for one-shot migrations)
# and NEON_BRANCH. Making that file a first-class source means the linked
# Neon branch (e.g. `production`) is the machine's authority once `neon init`
# has been run, while machines that never ran it keep using backend/.env.
# Real environment variables still beat both files (pydantic-settings), which
# is how a migration run overrides to the unpooled URL:
#   DATABASE_URL=<unpooled-url> alembic upgrade head
neon_env_path = env_path.parent.parent / ".env.local"

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200
    CLOUDINARY_CLOUD_NAME: str
    CLOUDINARY_API_KEY: str
    CLOUDINARY_API_SECRET: str
    SMTP_EMAIL: str
    SMTP_PASSWORD: str
    GEMINI_API_KEY: str
    GEMINI_MODEL_NAME: str

    # --- Neon-managed vars (neon init / neon deploy -> repo-root .env.local) ---
    # Direct (unpooled) connection string for one-shot migration runs
    # (DATABASE_URL=<this value> alembic upgrade head). Pooled DATABASE_URL
    # stays the app-runtime default.
    DATABASE_URL_UNPOOLED: str = ""
    # Informational: which Neon branch the CLI linked this machine to.
    NEON_BRANCH: str = ""

    # --- Error monitoring (Sentry) ---
    # Empty default: local dev machines without SENTRY_DSN run normally with
    # Sentry fully disabled (init is skipped in main.py). Render env sets the
    # real DSN; get it from the Sentry project -> Client Keys.
    SENTRY_DSN: str = ""
    # Performance tracing sample; 0.0 turns transactions off entirely.
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1

    # --- Deployment knobs (all optional; safe defaults for local dev) ---

    # Comma-separated list of browser origins allowed to call this API.
    # Deploying the portal at https://app.example.com means setting
    # CORS_ORIGINS=https://app.example.com here — the old hard-coded
    # localhost:5173 pair silently blocked every production request.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Weekly critical-area insights sweep. Runs in a daemon thread at import
    # time; with multiple uvicorn workers each worker would run its own
    # sweep, so multi-worker deployments must leave this True on exactly ONE
    # process (or keep --workers 1, the recommended setup — YOLO inference
    # is semaphore-bounded anyway).
    SWEEP_ENABLED: bool = True

    # Upload temp-file reaper (backend/temp): the Stage-B worker deletes its
    # file per task, but a crashed process never will — without the reaper
    # that leaks disk forever on a long-lived box. Disable only if something
    # else manages the directory.
    TEMP_CLEANER_ENABLED: bool = True
    TEMP_FILE_MAX_AGE_HOURS: int = 24

    # JWT lifetime in minutes — defaults to 43200 = 30 days. This is a
    # deliberate, long-lived citizen-app session policy; override per
    # environment if a shorter token life is wanted.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200

    class Config:
        env_file = (env_path, neon_env_path)
        env_file_encoding = 'utf-8'

settings = Settings()