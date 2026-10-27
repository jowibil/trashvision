from PIL import Image
import piexif
import re
from datetime import date as _date


def extract_dimensions(image_path: str):
    """
    Original-frame pixel dimensions (width, height). Captured at upload time
    so clients can scale bounding boxes without decoding the full-res image.
    Returns (None, None) on any failure — dimensions are optional metadata.
    """
    try:
        with Image.open(image_path) as img:
            return img.width, img.height
    except Exception as e:
        print(f"Dimension extraction failed for {image_path}: {e}")
        return None, None

def extract_gps(image_path: str):
    try:
        img = Image.open(image_path)
        exif_bytes = img.info.get('exif')
        if not exif_bytes:
            return None, None

        exif_data = piexif.load(exif_bytes)
        gps = exif_data.get('GPS', {})

        if not gps:
            return None, None

        def convert_to_degrees(value):
            d, m, s = value
            return d[0]/d[1] + (m[0]/m[1])/60 + (s[0]/s[1])/3600

        lat_ref = gps.get(piexif.GPSIFD.GPSLatitudeRef)
        lon_ref = gps.get(piexif.GPSIFD.GPSLongitudeRef)
        lat_val = gps.get(piexif.GPSIFD.GPSLatitude)
        lng_val = gps.get(piexif.GPSIFD.GPSLongitude)

        if not all([lat_ref, lon_ref, lat_val, lng_val]):
            return None, None

        lat = convert_to_degrees(lat_val)
        lng = convert_to_degrees(lng_val)

        if lat_ref == b'S':
            lat = -lat
        if lon_ref == b'W':
            lng = -lng

        return round(lat, 6), round(lng, 6)

    except Exception as e:
        print(f"GPS extraction failed for {image_path}: {e}")
        return None, None


def extract_capture_date(image_path: str):
    """
    EXIF capture (shutter-release) date, normalized to 'YYYY-MM-DD'.
    UPLOAD-AID ONLY: the stored images.captured_at stays the admin's
    flight date (see routes/flights.py). EXIF carries no timezone and
    drone camera clocks drift, so this is for confirmation / mismatch
    warnings, never a silent source of truth.

    Preference order: DateTimeOriginal (actual shutter time) >
    DateTimeDigitized > the 0th-directory file DateTime (upload/copy
    timestamp, e.g. re-encoded frames). Returns None on any failure —
    the aid degrades to 'no EXIF date', matching the optional-GPS
    pattern.
    """
    try:
        with Image.open(image_path) as img:
            exif_bytes = img.info.get('exif')
            if not exif_bytes:
                return None

            exif_data = piexif.load(exif_bytes)
            raw = (
                exif_data.get('Exif', {}).get(piexif.ExifIFD.DateTimeOriginal)
                or exif_data.get('Exif', {}).get(piexif.ExifIFD.DateTimeDigitized)
                or exif_data.get('0th', {}).get(piexif.ImageIFD.DateTime)
            )
            if not raw:
                return None

            if isinstance(raw, bytes):
                raw = raw.decode('ascii', errors='ignore')
            raw = raw.strip().strip('[0\x00]').strip()

            match = re.match(r'(\d{4})[:-](\d{2})[:-](\d{2})', raw)
            if not match:
                return None
            y, m, d = match.group(1), match.group(2), match.group(3)

            # Validate the day component before exposing it ("2026:13:45"
            # garbage from a scrambled clock must read as no-date, not as
            # an impossible calendar date).
            _date(int(y), int(m), int(d))
            return f"{y}-{m}-{d}"

    except Exception as e:
        print(f"Capture-date extraction failed for {image_path}: {e}")
        return None
    
    
    
