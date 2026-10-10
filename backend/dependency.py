from fastapi import HTTPException, Depends, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from config import settings
from slowapi import Limiter
from slowapi.util import get_remote_address
from typing import Optional

ROLE_HIERARCHY = {
    "guest": 0,
    "community": 1,
    "admin": 2,
}

# rate limiter
limiter = Limiter(key_func=get_remote_address)
# Find bearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
# Optional bearer for PUBLIC read endpoints: returns None when no
# Authorization header is present instead of raising 401 (auto_error=False).
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

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


def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Like get_current_user but tolerant of anonymous visitors.

    No Authorization header -> None (browse without an account). A header
    that IS present must still be valid — expired/garbage tokens raise 401
    so stale web sessions get their usual cleanup flow.
    """
    if token is None:
        return None
    return get_current_user(token=token, db=db)


def require_public(min_role: str = "guest"):
    """Guard for PUBLIC READ endpoints (product decision 2026-10: the web
    portal's Dashboard/MapView/Reports/TrashLogs are browsable without an
    account — 'Open Forecast' must work logged-out).

    - No token  -> anonymous read (returns None user).
    - Valid token -> role checked against [min_role] as usual.
    - Invalid/expired token -> 401 (same as require_role).

    NEVER use on write/admin endpoints — those keep require_role().
    """
    required_level = ROLE_HIERARCHY[min_role]

    def wrapper(current_user: Optional[User] = Depends(get_optional_user)):
        if current_user is None:
            return None
        user_level = ROLE_HIERARCHY.get(current_user.role.lower(), 0)
        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return wrapper

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