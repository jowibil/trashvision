import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

/// Typed API error carrying the HTTP status code. Screens branch on
/// [statusCode] (e.g. login: 401 -> bad credentials, 5xx -> server error)
/// instead of string-matching error text. Previously defined in
/// auth_service.dart; moved here so every service throws the same type.
class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);

  @override
  String toString() => message;
}

/// FIX (Step 6): the auth screens each hand-rolled their own error→message
/// mapping — login string-matched exception text, register/reset showed
/// `e.toString()` verbatim (leaking internal details like the API host to
/// the user). This is the single known-safe mapping; screens should log the
/// raw error with debugPrint and show only this result.
String userMessage(Object error) {
  if (error is ApiException) {
    if (error.statusCode >= 500) return 'Server error. Please try again later.';
    // 4xx messages come straight from the backend's `detail` (e.g. "An
    // account with this email already exists.") — they're user-facing by
    // design.
    return error.message;
  }

  final raw = error.toString();
  if (raw.contains('SocketException') || raw.contains('Failed host lookup')) {
    return 'No internet connection.';
  }
  if (error is TimeoutException || raw.contains('TimeoutException')) {
    return 'The request timed out. Please try again.';
  }
  if (raw.contains('FormatException')) {
    return 'Unexpected response from the server. Please try again later.';
  }
  if (raw.contains('No host specified in URI') ||
      raw.contains('Invalid argument')) {
    // Most often an unconfigured/misconfigured API host (release builds
    // without API_BASE_URL, typos in .env).
    return 'Server address is not configured correctly.';
  }
  return 'Something went wrong. Please try again.';
}

/// Convenience so screens can log once and show once.
void logAndReport(Object error, {String? context}) {
  debugPrint(context != null ? '$context: $error' : '$error');
}

/// Shared HTTP layer for every service in the app. One place owns:
///  - the auth token (secure storage) and Authorization header
///  - the request timeout budget
///  - non-2xx -> ApiException translation (parses FastAPI's {"detail": ...})
///
/// [MobileMapService] previously sent NO auth header on `/mobile/map/*`
/// (those endpoints are also unprotected server-side — enforcing that is a
/// deliberate, coordinated follow-up so older APKs don't break). Sending the
/// header is harmless today and makes the server-side switch a no-op for
/// current builds.
class ApiClient {
  ApiClient._();

  static const _storage = FlutterSecureStorage();
  static const timeout = Duration(seconds: 15);

  /// Invoked when an authenticated request is rejected with 401 — the signal
  /// that the stored session is no longer valid. main.dart installs the
  /// handler (clear secure storage + redirect to /login + snackbar).
  ///
  /// Deliberately NOT invoked for requests made with `auth: false`
  /// (login/register/reset): a 401 there means wrong credentials, not an
  /// expired session — firing the hook would redirect-loop the login screen.
  static void Function()? onUnauthorized;

  /// Latch: set the first time a 401 triggers [notifyUnauthorized], cleared
  /// by [markSessionValid] on a successful login. Prevents N in-flight
  /// failures (and later background calls like the connectivity-triggered
  /// sync) from repeatedly redirecting — which would reset the login form
  /// while the user is typing on it.
  static bool _sessionInvalidated = false;

  static void notifyUnauthorized() {
    if (_sessionInvalidated) return;
    _sessionInvalidated = true;
    onUnauthorized?.call();
  }

  /// Clear the latch after a fresh, successful login so a *new* expiry can
  /// trigger the flow again.
  static void markSessionValid() => _sessionInvalidated = false;

  /// Dev-tunnel convenience: skips ngrok's browser-warning interstitial.
  /// Harmless in production.
  static const _defaultHeaders = {
    'ngrok-skip-browser-warning': 'true',
  };

  static Future<String?> authToken() => _storage.read(key: 'token');

  static Future<Map<String, String>> authHeaders({Map<String, String>? extra}) async {
    final token = await authToken();
    return {
      ..._defaultHeaders,
      if (extra != null) ...extra,
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, String>> _headers({
    required bool auth,
    Map<String, String>? extra,
  }) async {
    if (!auth) {
      return {..._defaultHeaders, if (extra != null) ...extra};
    }
    return authHeaders(extra: extra);
  }

  static Future<http.Response> get(
    Uri uri, {
    bool auth = true,
    Map<String, String>? headers,
  }) async {
    final resolved = await _headers(auth: auth, extra: headers);
    final res = await http.get(uri, headers: resolved).timeout(timeout);
    if (res.statusCode == 401 && auth) notifyUnauthorized();
    return res;
  }

  static Future<http.Response> post(
    Uri uri, {
    required Map<String, dynamic> body,
    bool auth = true,
    Map<String, String>? headers,
  }) async {
    final resolved = await _headers(
      auth: auth,
      extra: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (headers != null) ...headers,
      },
    );
    final res = await http.post(uri, headers: resolved, body: jsonEncode(body)).timeout(timeout);
    if (res.statusCode == 401 && auth) notifyUnauthorized();
    return res;
  }

  /// Decodes a JSON body, translating non-2xx responses into [ApiException]
  /// with the backend's `detail` message when present.
  static dynamic decodeJson(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      String detail = 'Request failed (HTTP ${res.statusCode})';
      try {
        final body = jsonDecode(res.body);
        if (body is Map && body['detail'] != null) detail = body['detail'].toString();
      } catch (_) {
        // Non-JSON error body — keep the generic message.
      }
      throw ApiException(res.statusCode, detail);
    }
    return jsonDecode(res.body);
  }
}
