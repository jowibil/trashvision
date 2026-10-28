import os
import sys
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from config import settings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, areas, reports, flights, mobile_map, logs, detections, user, chat, info, insights
from dependency import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler


app = FastAPI(title="TrashVision")

# CORS origins come from the environment (comma-separated CORS_ORIGINS):
# the old hard-coded localhost pair silently blocked every production
# browser request. Export the deployed portal's origin(s) per environment.
_cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

# Pre-Deployment Checklist (transport & headers): hardening this service can
# apply safely at the app level — the API serves only JSON and Swagger docs,
# nothing here is meant to be framed or embedded. HTTPS, HSTS and the portal
# page's real CSP belong to the reverse proxy / static hosting layer, where
# pages with map tiles and Cloudinary images are served.
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Content-Security-Policy",
        "frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    )
    return response
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(detections.router, prefix="/detections", tags=["Detections"])
app.include_router(mobile_map.router, prefix="/mobile/map", tags=["Mobile Map"])
app.include_router(reports.router, prefix="/reports", tags=["Reports"])
app.include_router(logs.router, prefix="/logs", tags=["Logs"])
app.include_router(areas.router, prefix="/areas", tags=["Areas"])
app.include_router(flights.router, prefix="/flights", tags=["Flights"])
app.include_router(user.router, prefix="/users", tags=["Users"])
app.include_router(chat.router, prefix="/gemini", tags=["Chat"])
app.include_router(info.router, prefix="/info", tags=["Info"])
app.include_router(insights.router, prefix="/insights", tags=["Insights"])

# Weekly critical-area sweep (brief Task 3a, product decision 2026-10-27:
# per-flight triggers + a scheduled full sweep). Dependency-free daemon
# thread; the repo has no job scheduler and none was added. Multi-worker
# deployments must leave SWEEP_ENABLED=True on exactly ONE process.
if settings.SWEEP_ENABLED:
    from database import SessionLocal
    from services.insights_service import start_sweep_thread
    start_sweep_thread(SessionLocal)

# Upload temp-file reaper: crashed Stage-B workers would otherwise leak
# backend/temp files forever (see services/temp_cleanup_service).
if settings.TEMP_CLEANER_ENABLED:
    from services.temp_cleanup_service import start_temp_cleaner
    start_temp_cleaner(settings.TEMP_FILE_MAX_AGE_HOURS)

@app.get("/")
def root():
    return {"message": "TrashVision API is running"}