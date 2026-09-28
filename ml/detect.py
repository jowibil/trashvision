# ml/detect.py or backend/config/ml_config.py
import os
from ultralytics import YOLO

# Get the absolute root directory of your project
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Target the weights outside the backend directory explicitly
WEIGHTS_PATH = os.path.join(BASE_DIR, "ml", "weights", "trashvision", "weights", "best.pt")

class TrashDetector:
    def __init__(self):
        # Load the model directly using the structural path setup
        if os.path.exists(WEIGHTS_PATH):
            self.model = YOLO(WEIGHTS_PATH)
            print(f"Custom YOLOv8 Engine successfully initialized with weights: {WEIGHTS_PATH}")
        else:
            raise FileNotFoundError(f"🚨 Could not find best.pt at {WEIGHTS_PATH}. Check your folder architecture.")

    def run_inference(self, file_path: str):
        results = self.model(file_path, conf=0.25) # Run model prediction
        detections = []
        
        for result in results:
            for box in result.boxes:
                # Format to match your detection_service schema
                detections.append({
                    "classification": self.model.names[int(box.cls[0])],
                    "confidence_score": float(box.conf[0]),
                    "bounding_box": [float(x) for x in box.xyxy[0].tolist()]
                })
        return detections

# Instantiate the singleton engine instance
trash_detector = TrashDetector()