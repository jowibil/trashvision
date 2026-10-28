from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="community")
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login = Column(DateTime(timezone=True))
    # Pre-Deployment Checklist (security/sessions): set on every password
    # change; get_current_user rejects tokens whose `iat` predates it, so a
    # password reset invalidates all previously issued sessions (JWTs live up
    # to 30 days otherwise). NULL = never changed since deployment → no check.
    password_changed_at = Column(DateTime(timezone=True), nullable=True)

    reports = relationship("Report", back_populates="user")