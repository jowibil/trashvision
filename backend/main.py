import os
import sys
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import auth, areas, reports, flights, mobile_map, logs, detections, user, chat
from dependency import limiter
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler


app = FastAPI(title="TrashVision")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173"
        ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)
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

@app.get("/")
def root():
    return {"message": "TrashVision API is running"}