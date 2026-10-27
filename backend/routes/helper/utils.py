from pydantic import BaseModel, EmailStr, Field, computed_field
from typing import Optional, Dict, Any, List
import uuid
from uuid import UUID
from datetime import datetime, date

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1)
    email: EmailStr
    password: str = Field(..., min_length=6)

class LoginRequest(BaseModel):
    email: str
    password: str
    
class ForgotPasswordRequest(BaseModel):
        email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str
    
    # py_schemas.py
class UserResponse(BaseModel):
    user_id: str
    name: str
    role: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    
class AreaCreate(BaseModel):
    area_name: str
    boundary_coordinates: Dict[str, Any] = None
    description: Optional[str] = None
    

class ReportDetectionPublic(BaseModel):
    """One raw YOLO box for a verified report's photo (wire shape shared by
    PATCH /reports/{id}/status and GET /reports/{id} — design §5)."""
    waste_type: str
    confidence_score: float
    bbox_x1: float
    bbox_y1: float
    bbox_x2: float
    bbox_y2: float


class ReportPublic(BaseModel):
    report_id: uuid.UUID
    waste_type: str
    description: Optional[str]
    photo_url: Optional[str] 
    status: str
    # Per-report YOLO analysis state; 'pending' also covers pre-existing
    # verified reports with no backfill (design D11).
    analysis_status: str = "pending"
    timestamp: datetime
    reporter_name: str       
    latitude: float          
    longitude: float       
    class Config:
        from_attributes = True 


class ReportDetailResponse(ReportPublic):
    """GET /reports/{id}: ReportPublic + embedded detections (detail-on-demand,
    design §5.2 — list endpoints never carry detections)."""
    detections: List[ReportDetectionPublic] = []


class BulkDeleteRequest(BaseModel):
    report_ids: List[UUID]


class FlightCreate(BaseModel):
    flight_date: date
    pilot_name: str
    area_covered: Optional[str] = None
    notes: Optional[str] = None
    area_id: Optional[str] = None
    
class FlightResponse(BaseModel):
    flight_id: uuid.UUID
    flight_date: date
    pilot_name: str
    area_covered: Optional[str] = None
    notes: Optional[str] = None
    area_id: Optional[uuid.UUID] = None
    
    class Config:
        from_attributes = True