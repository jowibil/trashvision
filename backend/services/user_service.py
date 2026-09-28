import uuid
from sqlalchemy.orm import Session
from models.user import User 

class UserService:
    @staticmethod
    def get_user_profile_by_id(db: Session, user_id: str):
        try:
            target_uuid = uuid.UUID(user_id)
        except ValueError:
            return None
        return db.query(User).filter(User.user_id == target_uuid).first()