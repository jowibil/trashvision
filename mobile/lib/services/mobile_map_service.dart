import 'package:flutter/material.dart';
import '../config/app_config.dart';
import '../models/mobile_map_models.dart';
import 'api_client.dart';

/// HTTP client for the mobile map endpoints, built on the shared [ApiClient]
/// so map requests now carry the same Authorization header as every other
/// service (previously map requests were unauthenticated).
///
/// Error semantics (kept from the mapview refactor):
///  - [getAreas] returns null on failure so the UI can tell "network error"
///    apart from "legitimately no areas configured" (an empty list).
///  - [getHexBins] throws (ApiException on non-2xx) so the caller can surface
///    an error state instead of silently rendering a misleading "no
///    detections" empty map.
class MobileMapService {
  static String get baseUrl => AppConfig.mobileMapBaseUrl;

  /// Returns null on failure so the UI can tell "network error" apart from
  /// "legitimately no areas configured" (an empty list).
  static Future<List<AreaModel>?> getAreas() async {
    try {
      final res = await ApiClient.get(Uri.parse('$baseUrl/areas'));
      return (ApiClient.decodeJson(res) as List)
          .map((e) => AreaModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      debugPrint('getAreas error: $e');
      return null;
    }
  }

  /// Throws on network/HTTP failure so the caller can surface an error state
  /// instead of silently rendering a misleading "no detections" empty map.
  static Future<List<HexBin>> getHexBins({
    required String areaId,
    required DateTime selectedDate,
    required int week,
    required int threshold,
  }) async {
    final uri = Uri.parse('$baseUrl/areas/$areaId/tiles').replace(
      queryParameters: {
        'month': selectedDate.month.toString(),
        'year': selectedDate.year.toString(),
        'week': week.toString(),
        'threshold': threshold.toString(),
      },
    );
    final res = await ApiClient.get(uri);
    return (ApiClient.decodeJson(res) as List)
        .map((e) => HexBin.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Throws on failure so the drawer can show a retryable error state
  /// instead of a misleading "no images in this sector" (Step 4: network
  /// errors are not the same as an empty sector).
  static Future<List<DroneImage>> getBatchImages(List<String> imageIds) async {
    if (imageIds.isEmpty) return [];
    final res = await ApiClient.post(
      Uri.parse('$baseUrl/images/batch'),
      body: {'image_ids': imageIds},
    );
    return (ApiClient.decodeJson(res) as List)
        .map((e) => DroneImage.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
