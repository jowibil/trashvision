import secrets
import uuid
from uuid import UUID
from sqlalchemy.orm import Session
from models.user import User
from models.password_reset import PasswordReset
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta, timezone
from config import settings
from fastapi import HTTPException, status

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
# Create User
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_token(user_id: uuid.UUID, role: str, name: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "role": role,
        "name": name,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access"
    }

    return jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )

def register_user(db: Session, name: str, email: str, password: str, role: str = "community"):
    clean_name = name.strip()
    clean_email = email.strip().lower()
    clean_password = password.strip()
    
    if not clean_name or not clean_email or not clean_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fields cannot be empty or contain only whitespace."
        )

    if "@" not in clean_email or "." not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Invalid email format."
        )

    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists."
        )

    try:
        user = User(
            name=clean_name,
            email=clean_email,
            password_hash=hash_password(clean_password),
            role=role
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        return {
            "message": "Registration successful",
            "user_id": str(user.user_id),
            "name": user.name,
            "role": user.role
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during registration."
        )

def login_user(db: Session, email: str, password: str):
    clean_email = email.strip().lower()
    
    user = db.query(User).filter(User.email == clean_email).first()
    error_msg = "Invalid email or password"
    
    if not user:
        raise HTTPException(status_code=401, detail=error_msg)
    
    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail=error_msg)
    
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    
    token = create_token(user_id=user.user_id, role=user.role, name=user.name)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "user_id": str(user.user_id),
            "name": user.name,
            "role": user.role
        }
    }
    
# Reset Password
def create_password_reset_code(db: Session, email: str):
    email = email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    
    if not user:
        return None
    db.query(PasswordReset).filter(
        PasswordReset.email == email, 
        PasswordReset.used == False
    ).update({"used": True})
    
    raw_code = f"{secrets.randbelow(900000)+100000}"
    hashed_code = pwd_context.hash(raw_code)
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    reset_entry = PasswordReset(
        email=email, 
        code=hashed_code, 
        expires_at=expires
    )

    db.add(reset_entry)
    db.commit()
    
    return raw_code
    
def verify_and_update_password(db: Session, email: str, code: str, new_password: str):
    email = email.lower().strip()

    reset_request = db.query(PasswordReset).filter(
        PasswordReset.email == email,
        PasswordReset.used == False,
        PasswordReset.expires_at > datetime.now(timezone.utc)
    ).order_by(PasswordReset.id.desc()).first()

    if not reset_request or not pwd_context.verify(code, reset_request.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code"
        )

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    new_hashed = pwd_context.hash(new_password)
    user.password_hash = new_hashed
    reset_request.used = True
    db.commit()
    return True



# CRUD
def remove_user(db: Session, target_user_id: UUID, current_admin_id: UUID):
    user = db.query(User).filter(User.user_id == target_user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="User not found"
        )
        
    if target_user_id == current_admin_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="You cannot delete your own admin account."
        )

    try:
        db.delete(user)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error during deletion."
        )
        
    return True