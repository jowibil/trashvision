from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, status
from sqlalchemy.orm import Session
from services.email_service import send_reset_email
from services import auth_service
from database import get_db
from services.auth_service import register_user, login_user
from pydantic import BaseModel, EmailStr, Field
from dependency import require_role, limiter, get_current_active_admin
from models import User
from routes.helper.utils import RegisterRequest, LoginRequest, ResetPasswordRequest, ForgotPasswordRequest, UserResponse, LoginResponse


router = APIRouter()



@router.post("/register")
# SECURITY (audit 2026-10-28): unrate-limited registration allowed mass fake
# account creation; 3/minute per IP is plenty for real sign-ups.
@limiter.limit("3/minute")
def register(request: Request, data: RegisterRequest, db: Session = Depends(get_db)):
    return register_user(db, data.name, data.email, data.password, role="community")

@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login( request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    return auth_service.login_user(db, data.email, data.password) 

@router.get("/users")
def get_all_users(db: Session = Depends(get_db), admin = Depends(require_role("admin"))):
    return db.query(User).all()

@router.post("/forgot-password")
# SECURITY (audit 2026-10-28): this endpoint triggers a real SMTP send per
# call, so an unlimited loop is an email-bombing channel against any address
# (not just TrashVision accounts). 3/minute per IP.
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db)):
    raw_code = auth_service.create_password_reset_code(db, payload.email)
    if raw_code:
        background_tasks.add_task(send_reset_email, payload.email, raw_code)
    return {"message": "If this email is registered, a code has been sent."}

@router.post("/reset-password")
# SECURITY (audit 2026-10-28): the 6-digit reset code has no attempt counter
# (schema change would be needed), so per-IP throttling is the anti-brute-
# force control: 5/minute means ~15 guesses inside the 3-minute code lifetime
# — a ~1-in-60,000 chance per window instead of a spray over all 900k codes.
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest, 
    db: Session = Depends(get_db)):
    auth_service.verify_and_update_password(db, payload.email, payload.code, payload.new_password)
    return {"message": "Password updated successfully"}

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_route(
    user_id: UUID, 
    db: Session = Depends(get_db),
    current_admin = Depends(get_current_active_admin)):
    auth_service.remove_user(
        db=db, 
        target_user_id=user_id, 
        current_admin_id=current_admin.user_id
    )
    
    return None