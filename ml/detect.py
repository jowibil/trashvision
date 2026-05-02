from ultralytics import YOLO
from PIL import Image
import piexif
import os
import json
from datetime import datetime

def extract_gps(image_path):
    """Extract GPS coordinates from image EXIF metadata"""
    try:
        img = Image.open(image_path)
        exif_data = piexif.load(img.info['exif'])
        gps = exif_data.get('GPS', {})

        if not gps:
            return None, None

        def convert_to_degrees(value):
            d, m, s = value
            return d[0]/d[1] + m[0]/m[1]/60 + s[0]/s[1]/3600

        lat = convert_to_degrees(gps[piexif.GPSIFD.GPSLatitude])
        lon = convert_to_degrees(gps[piexif.GPSIFD.GPSLongitude])

        if gps[piexif.GPSIFD.GPSLatitudeRef] == b'S':
            lat = -lat
        if gps[piexif.GPSIFD.GPSLongitudeRef] == b'W':
            lon = -lon

        return lat, lon
    except Exception as e:
        print(f"Could not extract GPS from {image_path}: {e}")
        return None, None


def process_batch(image_folder):
    """Process a folder of drone images through the trained model"""

    # Load your trained model
    model = YOLO('weights/trashvision/weights/best.pt')

    results_log = []

    image_extensions = ('.jpg', '.jpeg', '.png', '.JPG', '.JPEG')
    images = [f for f in os.listdir(image_folder) if f.endswith(image_extensions)]

    print(f"Found {len(images)} images to process...")

    for image_file in images:
        image_path = os.path.join(image_folder, image_file)

        # Extract GPS and timestamp from image
        lat, lon = extract_gps(image_path)
        timestamp = datetime.now().isoformat()  # or extract from EXIF

        # Run model on image
        results = model(image_path, conf=0.5)  # conf = confidence threshold

        for result in results:
            for box in result.boxes:
                waste_type = model.names[int(box.cls)]
                confidence = float(box.conf)

                detection = {
                    'image': image_file,
                    'waste_type': waste_type,
                    'confidence': confidence,
                    'latitude': lat,
                    'longitude': lon,
                    'timestamp': timestamp
                }

                results_log.append(detection)
                print(f"  Detected: {waste_type} ({confidence:.2f}) at {lat}, {lon}")

    # Save results to JSON for now (later this goes directly to your database)
    output_path = 'detection_results.json'
    with open(output_path, 'w') as f:
        json.dump(results_log, f, indent=2)

    print(f"\nDone. {len(results_log)} detections saved to {output_path}")
    return results_log


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='Path to folder of drone images')
    args = parser.parse_args()

    process_batch(args.input)