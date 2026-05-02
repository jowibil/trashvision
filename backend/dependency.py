from fastapi import HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from config import settings
from slowapi import Limiter
from slowapi.util import get_remote_address

ROLE_HIERARCHY = {
    "guest": 0,
    "community": 1,
    "admin": 2,
}

# rate limiter
limiter = Limiter(key_func=get_remote_address)
# Find bearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Decode the JWT token
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        role = payload.get("role")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Check if user exists in DB
    user = db.query(User).filter(User.user_id == user_id).first()
    
    if user is None:
        raise credentials_exception
    user.role = role
    return user

def get_current_active_admin(current_user: User = Depends(get_current_user)):
    if current_user.role.lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="You do not have the required permissions"
        )
    return current_user

def require_role(min_role: str):
    def wrapper(current_user: User = Depends(get_current_user)):
        user_level = ROLE_HIERARCHY.get(current_user.role.lower(), 0)
        required_level = ROLE_HIERARCHY[min_role]

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        return current_user

    return wrapper