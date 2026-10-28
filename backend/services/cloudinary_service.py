import cloudinary
import cloudinary.uploader
from config import settings
from fastapi import UploadFile, HTTPException
from PIL import Image
import io
import tempfile
import os

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET
)

# SECURITY: citizen upload guard (audit 2026-10-28). The old code piped the
# entire request body into memory and straight to Cloudinary with no size or
# MIME checks — a hostile client could exhaust backend memory and burn
# Cloudinary quota with arbitrary non-image payloads. Now: MIME declared as
# image/*, hard 10 MB ceiling, and a real PIL decode (magic-byte check — a
# renamed .exe never opens as an image) before anything is stored.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_UPLOAD_DIMENSION = 8000  # decompression bomb guard (Pillow < 89M px check)


def _validate_image_upload(file: UploadFile, contents: bytes) -> None:
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Photo must be an image file")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Photo exceeds the 10 MB size limit")
    try:
        with Image.open(io.BytesIO(contents)) as img:
            if max(img.size) > MAX_UPLOAD_DIMENSION:
                raise HTTPException(
                    status_code=413,
                    detail="Photo dimensions exceed 8000 pixels",
                )
            img.verify()  # integrity/magic-byte check; format must be a real image
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid image")


async def upload_image(file: UploadFile) -> str:
    contents = await file.read()
    _validate_image_upload(file, contents)

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        result = cloudinary.uploader.upload(
            tmp_path,
            folder="trashvision/reports"
        )
        return result.get("secure_url", "")
    except Exception as e:
        print(f"Cloudinary upload failed: {e}")
        return ""
    finally:
        # Keep the reaper honest for validation successes: delete the temp
        # file on EVERY path, not just ones before first upload attempt.
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    
def upload_drone_image(file_path: str, flight_id: str) -> str:
    try:
        result = cloudinary.uploader.upload(
            file_path,
            folder=f"trashvision/flights/{flight_id}",
            resource_type="auto"
        )
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