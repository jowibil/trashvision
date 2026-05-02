import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from database import SessionLocal
from models.user import User
from services.auth_service import hash_password
import uuid

def seed():
    db = SessionLocal()
    # Check if admin already exists
    admin = db.query(User).filter(User.email == "trashvision_admin@gmail.com").first()
    if not admin:
        new_admin = User(
            name="TrashVision_Admin",
            email="trashvision_admin@gmail.com",
            password_hash=hash_password("capstoneproject_TrashVision"),
            role="admin",
            is_verified=True
        )
        db.add(new_admin)
        db.commit()
        print("Admin Seeded")
    else:
        print("Admin already exists.")
    db.close()

if __name__ == "__main__":
    seed()