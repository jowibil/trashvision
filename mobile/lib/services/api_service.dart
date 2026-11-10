import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:mime/mime.dart';
import '../config/app_config.dart';
import '../models/report_model.dart';
import 'api_client.dart';

class ApiService {
  String get baseUrl => AppConfig.reportsBaseUrl;

  /// FIX (Step 3): MultipartRequest bypasses ApiClient.get/post, so an
  /// expired session surfaced as plain `false` — indistinguishable from a
  /// network error, and it never triggered the global 401 redirect. Now
  /// returns the status code (0 on network error) so callers can tell a
  /// rejected session apart from "server unreachable", and 401s feed the
  /// same latch + redirect flow as every other endpoint.
  Future<int> uploadReport(Report report) async {
    try {
      var request = http.MultipartRequest('POST', Uri.parse('$baseUrl/'));

      // Shared token read + ngrok/accept headers so multipart requests get
      // the same treatment as JSON ones (the ngrok warning header was
      // previously missing here, and the JWT was attached ad hoc).
      request.headers.addAll(await ApiClient.authHeaders());

      request.fields['waste_type'] = report.wasteType;
      request.fields['latitude'] = report.latitude.toString();
      request.fields['longitude'] = report.longitude.toString();
      request.fields['user_id'] = report.userId;
      request.fields['description'] = report.description;

      // Idempotency key: the backend dedupes on it, so a retry after a
      // lost response or server restart returns the original report
      // instead of a second row.
      if (report.clientReportId != null) {
        request.fields['client_report_id'] = report.clientReportId!;
      }

      // Add the photo. The http package defaults MultipartFile content
      // types to "application/octet-stream" when none is passed, which the
      // backend's 2026-10-28 image-type validation rejects with 400 — look
      // the real type up from the file path instead.
      if (report.localPhotoPath != null) {
        final photoPath = report.localPhotoPath!;
        final mimeType = lookupMimeType(photoPath) ?? 'application/octet-stream';
        final mediaParts = mimeType.split('/');
        request.files.add(
          await http.MultipartFile.fromPath(
            'photo',
            photoPath,
            contentType: MediaType(mediaParts.first, mediaParts.last),
          ),
        );
      }

      var response = await request.send().timeout(ApiClient.timeout);
      if (response.statusCode == 401) ApiClient.notifyUnauthorized();
      // MIGRATION DIAGNOSTIC (temporary): the submit UI collapses every
      // failure into "Server unreachable. Saved to outbox." and drops the
      // response body, so the 400's actual `detail` was invisible. Print it
      // here so the failing rule shows in the console/logcat. Remove once
      // the cause is fixed.
      final debugBody = await response.stream.bytesToString();
      debugPrint("REPORT UPLOAD -> ${response.statusCode} $debugBody");
      return response.statusCode;
    } catch (e) {
      debugPrint("Sync Upload Error: $e");
      return 0; // network/timeout error — no HTTP response at all
    }
  }

  Future<List<Report>> getUserReports(String userId) async {
    try {
      final res = await ApiClient.get(Uri.parse('$baseUrl/user/$userId'));
      final List decodedData = ApiClient.decodeJson(res) as List;
      return decodedData.map((jsonItem) => Report.fromJson(jsonItem)).toList();
    } catch (e) {
      debugPrint("Upstream API Sync Lookup Error: $e");
      rethrow;
    }
  }

  Future<Map<String, dynamic>?> getUserProfile(String userId) async {
    try {
      // FIX: previously derived via baseUrl.replaceAll('/reports', '/users'),
      // which was fragile string surgery. AppConfig exposes the users path directly.
      final res = await ApiClient.get(Uri.parse('${AppConfig.usersBaseUrl}/$userId'));
      return ApiClient.decodeJson(res) as Map<String, dynamic>;
    } catch (e) {
      debugPrint("User profile fetch exception: $e");
      return null;
    }
  }

  /// FIX (audit #10 - "Mock analytics on Home"): backs the Home dashboard's
  /// "1,248 kg" / "94.2%" / weekly bar chart, which were previously hardcoded
  /// literals. Hits GET /logs/summary, which returns weekly_trends,
  /// total_detections, and hotspot_zones.
  Future<Map<String, dynamic>?> getLogsSummary() async {
    try {
      final res = await ApiClient.get(Uri.parse('${AppConfig.logsBaseUrl}/summary'));
      return ApiClient.decodeJson(res) as Map<String, dynamic>;
    } catch (e) {
      debugPrint("Logs summary fetch exception: $e");
      return null;
    }
  }

  /// Backs the Info page: GET /info (public, read-only) serves the ML dataset
  /// manifest plus the real thresholds the backend computes with — alert
  /// severity bands, the two DBSCAN stage params and the hex sizing clamps.
  /// The page shows those verbatim, so it can never drift from the code the
  /// way a hand-written docs page would.
  ///
  /// Returns null on any failure (network, timeout, 5xx) so the screen can
  /// fall back to its cached copy or an honest error state instead of
  /// rendering zeros.
  Future<Map<String, dynamic>?> getMlInfo() async {
    try {
      final res = await ApiClient.get(Uri.parse('${AppConfig.infoBaseUrl}/'));
      return ApiClient.decodeJson(res) as Map<String, dynamic>;
    } catch (e) {
      debugPrint("ML info fetch exception: $e");
      return null;
    }
  }
}
