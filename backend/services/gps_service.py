from PIL import Image
import piexif

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
    
    
    
