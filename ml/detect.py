# ml/detect.py or backend/config/ml_config.py
import os
import threading
from ultralytics import YOLO

# Get the absolute root directory of your project
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Target the weights outside the backend directory explicitly
WEIGHTS_PATH = os.path.join(BASE_DIR, "ml", "weights", "trashvision", "weights", "best.pt")

class TrashDetector:
    """YOLOv8 singleton with a thread-safe lazy model load.

    Load-at-import OOM-killed the 512MB Render deploy before uvicorn could
    bind its port (torch + model reserve most of the free-tier RAM at boot:
    "No open ports detected" -> crash loop). Deferring the load means the app
    boots, health checks pass, and the model occupies RAM only while a report
    is actually being analyzed. The weights-path validation stays at import,
    so a mis-deploy still fails fast.
    """

    def __init__(self):
        if not os.path.exists(WEIGHTS_PATH):
            raise FileNotFoundError(f"🚨 Could not find best.pt at {WEIGHTS_PATH}. Check your folder architecture.")
        self._model = None
        self._lock = threading.Lock()

    @property
    def model(self):
        if self._model is None:
            with self._lock:            # two pipelines can race the first load
                if self._model is None:
                    self._model = YOLO(WEIGHTS_PATH)
                    print(f"Custom YOLOv8 Engine initialized (lazy, first inference): {WEIGHTS_PATH}")
        return self._model

    def run_inference(self, file_path: str):
        results = self.model(file_path, conf=0.25)  # Run model prediction
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

# Instantiate the singleton engine instance (cheap now — no model in RAM yet)
trash_detector = TrashDetector()