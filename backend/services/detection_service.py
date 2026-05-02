from ultralytics import YOLO
from services.gps_service import extract_gps
from services.cloudinary_service import upload_file_path
from models.detection import Detection
from models.image import Image
from datetime import datetime
import uuid
import os

# model = YOLO('ml/weights/trashvision_large/best.pt')

def process_images(image_paths: list, db, flight_id=None, area_id=None):
    results_log = []

    for image_path in image_paths:
        lat, lon = extract_gps(image_path)
        timestamp = datetime.utcnow()
        filename = os.path.basename(image_path)

        file_url = upload_file_path(image_path)

        image_record = Image(
            file_url=file_url or "",
            filename=filename,
            captured_at=timestamp,
            flight_id=uuid.UUID(flight_id) if flight_id else None
        )
        db.add(image_record)
        db.flush()

        results = model(image_path, conf=0.5)

        for result in results:
            for box in result.boxes:
                waste_type = model.names[int(box.cls)]
                confidence = float(box.conf)

                detection = Detection(
                    waste_type=waste_type,
                    confidence_score=confidence,
                    latitude=lat if lat else 0.0,
                    longitude=lon if lon else 0.0,
                    timestamp=timestamp,
                    image_id=image_record.image_id,
                    area_id=uuid.UUID(area_id) if area_id else None
                )
                db.add(detection)

                results_log.append({
                    "waste_type": waste_type,
                    "confidence": round(confidence, 4),
                    "latitude": lat,
                    "longitude": lon,
                    "timestamp": str(timestamp),
                    "filename": filename
                })

    db.commit()
    return results_log