from sqlalchemy import Column, String, Integer, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from database import Base


class PasswordReset(Base):
    __tablename__ = "password_resets"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True)
    code = Column(String) 
    expires_at = Column(DateTime)
    used = Column(Boolean, default=False)