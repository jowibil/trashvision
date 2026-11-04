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
from datetime import datetime, timedelta, timezone

ROLE_HIERARCHY = {
    "guest": 0,
    "community": 1,
    "admin": 2,
}

# Rate-limiter keying.
#
# With Cloudflare sitting in front of the API, the socket address is a
# Cloudflare edge server, not the visitor — thousands of people share a
# handful of those. When the CF-Connecting-IP header is present it carries
# the visitor's real IP, so that is what we bucket by.
#
# One honest caveat: the header is only trustworthy for traffic that came
# through Cloudflare. A request aimed straight at the Railway origin
# (bypassing the proxy) can set it to anything, so a determined attacker
# can rotate fake values to dodge the per-IP limit.
# The full two-layer plan — a Cloudflare edge rule plus this limiter — is
# documented in docs/cloudflare-chat-edge-rule.md (not deployed yet for
# as long as the API stays on its free subdomain). Local/dev traffic has
# no such header and keys on the remote address as before.
def limiter_key(request: Request) -> str:
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip
    return get_remote_address(request)


limiter = Limiter(key_func=limiter_key)
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

    # SESSIONS (Pre-Deployment Checklist): a token issued BEFORE the last
    # password change is dead. The reset flow stamps users.password_changed_at
    # (auth_service.verify_and_update_password), so a password change
    # invalidates every outstanding token despite the 30-day JWT lifetime.
    # NULL column = never changed since this was deployed -> no check, and
    # the migration logs nobody out. 2 s leeway: a token minted in the same
    # second as the password write is not spuriously rejected.
    if user.password_changed_at is not None:
        try:
            issued_at = datetime.fromtimestamp(int(payload.get("iat")), timezone.utc)
            if issued_at + timedelta(seconds=2) < user.password_changed_at:
                raise credentials_exception
        except (TypeError, ValueError, OSError):
            raise credentials_exception

    # DB role is authoritative. The old code overwrote user.role with the
    # signed token claim, so a demoted admin kept admin rights until their
    # 30-day token expired. login_user issues a fresh claim from the DB at
    # every login, so nothing legitimate changes — only stale claims die.
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
    """Guard for public-READ endpoints. The web portal browses
    Dashboard/MapView/Reports/TrashLogs without an account — the public
    "Open Forecast" audience.

    - No token -> anonymous read (returns None user).
    - Valid token -> role checked against min_role as usual.
    - Invalid/expired token -> 401 (same as require_role).

    Never use on write or admin endpoints — those keep require_role().
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