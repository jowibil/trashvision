import 'package:flutter/foundation.dart';
import 'package:native_exif/native_exif.dart';

/// Writes a report's GPS fix into the JPEG's EXIF block.
///
/// The server already receives latitude/longitude as form fields, so this is
/// NOT how a report gets its position — it makes the PHOTO itself carry where
/// it was taken. That matters most in guest/offline mode, where the file can
/// sit in the outbox for days (or be pulled off the device on its own) and
/// still say where it came from without the app.
///
/// Best-effort by design: a plugin/platform failure (unsupported platform,
/// non-JPEG pick, read-only path) must never block a submission or lose a
/// queued report, so every error is logged and swallowed.
class ImageGeotag {
  ImageGeotag._();

  /// Stamps [path] with [latitude]/[longitude]. Returns true only when the
  /// tags were actually written.
  static Future<bool> stamp(
    String? path, {
    required double latitude,
    required double longitude,
  }) async {
    if (path == null || kIsWeb) return false;

    try {
      final exif = await Exif.fromPath(path);
      try {
        // Unsigned decimal plus a hemisphere ref: ExifInterface (Android) and
        // ImageIO (iOS) both store GPS as an unsigned rational triplet, so the
        // sign travels in the *Ref tag, never in the value.
        await exif.writeAttributes({
          'GPSLatitude': latitude.abs().toStringAsFixed(6),
          'GPSLatitudeRef': latitude >= 0 ? 'N' : 'S',
          'GPSLongitude': longitude.abs().toStringAsFixed(6),
          'GPSLongitudeRef': longitude >= 0 ? 'E' : 'W',
        });
      } finally {
        await exif.close();
      }
      return true;
    } catch (e) {
      debugPrint('Geotag stamp skipped (report still queued): $e');
      return false;
    }
  }
}
