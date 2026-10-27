import '../config/app_config.dart';
import 'api_client.dart';

/// One alert row from GET /insights (an unacknowledged critical-area alert
/// or the monthly digest). Numbers inside [message] are templated SQL
/// output — the app never computes them.
class InsightAlert {
  final String insightId;
  final String kind; // 'alert' | 'digest'
  final String? areaName;
  final String? severity;
  final int? detectionCount;
  final String? topType;
  final double? topTypePct;
  final double? changePct;
  final String message;
  final String? createdAt;

  InsightAlert({
    required this.insightId,
    required this.kind,
    this.areaName,
    this.severity,
    this.detectionCount,
    this.topType,
    this.topTypePct,
    this.changePct,
    required this.message,
    this.createdAt,
  });

  factory InsightAlert.fromJson(Map<String, dynamic> json) => InsightAlert(
        insightId: json['insight_id'] as String,
        kind: json['kind'] as String? ?? 'alert',
        areaName: json['area_name'] as String?,
        severity: json['severity'] as String?,
        detectionCount: (json['detection_count'] as num?)?.toInt(),
        topType: json['top_type'] as String?,
        topTypePct: (json['top_type_pct'] as num?)?.toDouble(),
        changePct: (json['change_pct'] as num?)?.toDouble(),
        message: json['message'] as String? ?? '',
        createdAt: json['created_at'] as String?,
      );
}

/// Response of GET /insights: unacknowledged alerts (newest first) + the
/// latest monthly digest (or null when none has rolled up yet).
class ActiveInsights {
  final List<InsightAlert> alerts;
  final InsightAlert? digest;

  ActiveInsights({required this.alerts, this.digest});
}

/// Critical-area alert delivery for the mobile app (brief Task 3d: an
/// in-app card; push notifications were deliberately NOT approved).
/// Acknowledge is a web-admin action — mobile has no admin surface, so the
/// card is read-only and alerts persist until an admin acknowledges them.
class InsightsService {
  InsightsService._();

  static Future<ActiveInsights?> getActiveInsights() async {
    try {
      final res = await ApiClient.get(Uri.parse('${AppConfig.insightsBaseUrl}/'));
      final body = ApiClient.decodeJson(res) as Map<String, dynamic>;
      final alertList = body['alerts'] is List
          ? (body['alerts'] as List)
              .whereType<Map<String, dynamic>>()
              .map(InsightAlert.fromJson)
              .toList()
          : <InsightAlert>[];
      final digest = body['digest'] is Map<String, dynamic>
          ? InsightAlert.fromJson(body['digest'] as Map<String, dynamic>)
          : null;
      return ActiveInsights(alerts: alertList, digest: digest);
    } on ApiException {
      rethrow;
    } catch (e) {
      // Parse/transport hiccups surface as "no insights" upstream instead of
      // a broken card (logAndReport keeps the debugPrint-single-source).
      logAndReport(e, context: 'getActiveInsights');
      return null;
    }
  }
}
