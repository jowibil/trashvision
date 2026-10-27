import os
from pydantic_settings import BaseSettings
from pathlib import Path
env_path = Path(__file__).parent / ".env"

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
        env_file = env_path
        env_file_encoding = 'utf-8'

settings = Settings()