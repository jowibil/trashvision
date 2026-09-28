import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
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

      // Add the photo
      if (report.localPhotoPath != null) {
        request.files.add(await http.MultipartFile.fromPath('photo', report.localPhotoPath!));
      }

      var response = await request.send().timeout(ApiClient.timeout);
      if (response.statusCode == 401) ApiClient.notifyUnauthorized();
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
}
