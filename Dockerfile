# TrashVision backend image (FastAPI + YOLOv8 CPU inference).
# Build context is the REPO ROOT (fly.toml sits here) so the image carries both
# backend/ and ml/ — the chain is: routes -> services/detection_service ->
# ml.detect -> ml/weights/trashvision/weights/best.pt (path pinned in
# ml/detect.py). backend/temp is NOT baked in: it's an empty host-mounted
# volume (see fly.toml [mounts]).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# libgl1 + libglib2.0-0: ultralytics pulls opencv-python, whose wheels need
# GL/GLib shared libs the slim base omits (they WERE provided by apt on the
# Render-style host). libgomp1: OpenMP runtime used by OpenCV/sklearn.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only torch/torchvision BEFORE ultralytics: the default PyPI torch wheel
# pulls multi-GB CUDA dependency bundles, which bloats the image and slows
# fly deploys. The CPU index keeps the image small; ultralytics then reuses
# the already-installed torch instead of reinstalling it.
RUN pip install --no-cache-dir torch torchvision \
    --index-url https://download.pytorch.org/whl/cpu

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY ml /app/ml

WORKDIR /app/backend

# Single worker, matching the deployment contract in backend/config.py
# (SWEEP_ENABLED must be on exactly one process; YOLO inference is
# already semaphore-bounded, so extra workers add RAM for nothing).
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
