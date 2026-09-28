import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  AppConfig._();

  /// Root API host, no trailing slash.
  ///
  /// FIX: the fallback was a hardcoded personal ngrok tunnel that shipped in
  /// every release build — a release APK without a valid .env silently aimed
  /// every request at a dead third-party host, producing cryptic failures
  /// instead of an obvious misconfiguration.
  ///
  /// Now: debug builds fall back to the ngrok tunnel for dev convenience;
  /// release builds require API_BASE_URL to be set (remember .env is bundled
  /// as a pubspec asset, so whatever is in it ships inside the APK).
  static String get apiBaseUrl {
    var url = dotenv.env['API_BASE_URL'];
    if (url == null || url.trim().isEmpty) {
      if (kDebugMode) {
        return const String.fromEnvironment(
          'DEV_FALLBACK_API_URL',
          defaultValue: 'https://shopper-agent-mustard.ngrok-free.dev',
        );
      }
      // Release: fail loudly and specifically, not with URI errors from
      // every screen.
      throw StateError(
        'API_BASE_URL is not configured. Add it to mobile/.env '
        '(bundled into the build as a pubspec asset) before building a '
        'release.',
      );
    }
    url = url.trim();

    // FIX: a bare host/IP in .env (e.g. "192.168.254.104", written without
    // a scheme for local LAN testing) has no scheme for Uri.parse to find a
    // host in, so "$apiBaseUrl/auth/login" parses as a relative path instead
    // of an absolute URL — surfacing as "Invalid argument(s): No host
    // specified in URI ...". Assume http:// for a bare host (LAN/dev is
    // virtually never https); leave it alone if a scheme is already present.
    if (!url.contains('://')) {
      url = 'http://$url';
    }

    // Guard against a trailing slash in .env causing double slashes below.
    return url.endsWith('/') ? url.substring(0, url.length - 1) : url;
  }

  static String get reportsBaseUrl => '$apiBaseUrl/reports';
  static String get authBaseUrl => '$apiBaseUrl/auth';
  static String get usersBaseUrl => '$apiBaseUrl/users';
  static String get mobileMapBaseUrl => '$apiBaseUrl/mobile/map';
  static String get logsBaseUrl => '$apiBaseUrl/logs';

  /// Mapbox token, previously read ad hoc via `dotenv.env['MAP_API']`
  /// directly inside mapview.dart.
  static String get mapboxToken => dotenv.env['MAP_API'] ?? '';

  /// Mapbox raster tile URL (streets-v12, 512px tiles). Kept next to the
  /// token so the URL shape lives in one place.
  static String get mapboxTileTemplate =>
      'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=$mapboxToken';
}