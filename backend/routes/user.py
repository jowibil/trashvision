from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from dependency import require_role
from services.user_service import UserService

router = APIRouter()

# SECURITY: requires a valid JWT. Any logged-in user can read a profile
# (mobile profile screen fetches its own); there are no privileged writes here.

@router.get("/{user_id}")
def get_user_profile(
    user_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role("guest")),
):
    user = UserService.get_user_profile_by_id(db, user_id)
    
    if not user:
        raise HTTPException(
            status_code=404, 
            detail="The requested user profile record could not be found."
        )
    return {
        "id": str(user.user_id),
        "name": user.name,
        "email": user.email
    }