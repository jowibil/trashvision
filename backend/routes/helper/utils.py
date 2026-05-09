from pydantic import BaseModel, EmailStr, Field
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
    

class ReportPublic(BaseModel):
    report_id: uuid.UUID
    waste_type: str
    description: Optional[str]
    photo_url: Optional[str] 
    status: str
    timestamp: datetime
    reporter_name: str       
    latitude: float          
    longitude: float       

    class Config:
        from_attributes = True 
        
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
        form_attributes = True