import os
from pydantic_settings import BaseSettings
from pathlib import Path
env_path = Path(__file__).parent / ".env"

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CLOUDINARY_CLOUD_NAME: str
    CLOUDINARY_API_KEY: str
    CLOUDINARY_API_SECRET: str
    SMTP_EMAIL: str
    SMTP_PASSWORD: str

    class Config:
        env_file = env_path
        env_file_encoding = 'utf-8'

settings = Settings()