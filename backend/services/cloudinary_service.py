import cloudinary
import cloudinary.uploader
from config import settings
from fastapi import UploadFile
import tempfile
import os

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)

async def upload_image(file: UploadFile) -> str:
    try:
        contents = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        result = cloudinary.uploader.upload(
            tmp_path,
            folder="trashvision/reports"
        )
        os.unlink(tmp_path)
        return result.get("secure_url", "")
    except Exception as e:
        print(f"Cloudinary upload failed: {e}")
        return ""

def upload_file_path(file_path: str) -> str:
    try:
        result = cloudinary.uploader.upload(
            file_path,
            folder="trashvision/detections"
        )
        return result.get("secure_url", "")
    except Exception as e:
        print(f"Cloudinary upload failed for {file_path}: {e}")
        return ""