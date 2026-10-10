import 'dart:convert';

import 'package:flutter/material.dart';
import '../config/app_config.dart';
import '../helper/database_helper.dart';
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
  ///
  /// [mode] selects the window (product decision 2026-10):
  ///  - "month": selected month + cumulative week cutoff (W2 = days 1-14).
  ///  - "accumulated": Jan 1 → end of the selected month, same year. The
  ///    UI hides the week chips in this mode; week is ignored server-side.
  static Future<List<HexBin>> getHexBins({
    required String areaId,
    required DateTime selectedDate,
    required int week,
    required int threshold,
    String mode = 'month',
  }) async {
    final uri = Uri.parse('$baseUrl/areas/$areaId/tiles').replace(
      queryParameters: {
        'month': selectedDate.month.toString(),
        'year': selectedDate.year.toString(),
        'week': week.toString(),
        'threshold': threshold.toString(),
        'mode': mode,
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
  ///
  /// Current contract: DETECTION ids (hex tiles now aggregate detections).
  /// Callers branch on `HexBin.detectionIds.isNotEmpty` and fall back to
  /// [getBatchImages] for un-updated servers.
  static Future<List<DroneImage>> getBatchDetections(List<String> detectionIds) async {
    if (detectionIds.isEmpty) return [];
    final res = await ApiClient.post(
      Uri.parse('$baseUrl/images/batch'),
      body: {'detection_ids': detectionIds},
    );
    return (ApiClient.decodeJson(res) as List)
        .map((e) => DroneImage.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Legacy image-id batch fetch (pre-detection-contract servers).
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

  /// Cache-then-network fetch for VERIFIED community report pins of one
  /// area (the map's community layer — secondary to the hexbin layer, so
  /// callers treat a no-cache failure as "layer unavailable", never as a
  /// whole-screen error).
  static Future<CacheResult<List<ReportPin>>> getReportPinsCached(String areaId) async {
    final cacheKey = 'reports_v1:$areaId';

    List<ReportPin>? parsedCache;
    final cached = await DatabaseHelper.instance.getMapCache(cacheKey);
    if (cached != null) {
      try {
        parsedCache = (jsonDecode(cached) as List)
            .map((e) => ReportPin.fromJson(e as Map<String, dynamic>))
            .toList();
      } catch (_) {
        parsedCache = null;
      }
    }

    try {
      final uri = Uri.parse('${AppConfig.reportsBaseUrl}/').replace(
        queryParameters: {
          'status': 'verified',
          'area_id': areaId,
          'limit': '200',
        },
      );
      final res = await ApiClient.get(uri);
      final fresh = (ApiClient.decodeJson(res) as List)
          .map((e) => ReportPin.fromJson(e as Map<String, dynamic>))
          .toList();
      await DatabaseHelper.instance.putMapCache(
        cacheKey,
        jsonEncode(fresh.map((p) => p.toJson()).toList()),
      );
      // Keep the cache bounded; the areas list must survive eviction.
      await DatabaseHelper.instance.trimMapCache(keep: {_areasCacheKey});
      return CacheResult(fresh, fromCache: false);
    } catch (_) {
      if (parsedCache != null) {
        return CacheResult(parsedCache, fromCache: true);
      }
      // No cache: rethrow so the caller keeps the layer empty without
      // mistaking the failure for "no reports".
      rethrow;
    }
  }

  // ─── Offline-first wrappers (cache-then-network) ─────────────────────────
  //
  // Pattern (see skill: trashvision-offline-first):
  //  1. Read the sqflite map_cache first — if present, return it immediately
  //     flagged fromCache so the UI can say "showing cached data".
  //  2. Try the network in parallel/afterwards; on success, persist and
  //     return fresh data.
  //  3. On network failure with no cache, return the same failure the raw
  //     method would have (null / throw) — never mask errors as empty data.

  static const String _areasCacheKey = 'areas_v1';

  static String _hexBinsCacheKey({
    required String areaId,
    required DateTime selectedDate,
    required int week,
    required int threshold,
    String mode = 'month',
  }) =>
      // v5: back to raw detection counts (map-level cross-flight clustering
      // was rolled back — v4 entries hold item counts). Mirrors the web's
      // hexbins_v5 key format exactly; mode segment comes FIRST so a
      // stale-while-revalidate hit always matches the active mode.
      'hexbins_v5:$mode:$areaId:${selectedDate.year}-${selectedDate.month}:w$week:t$threshold';

  /// Result of a cache-then-network fetch. [fromCache] true means the payload
  /// came from sqflite (either because the network failed, or because it was
  /// served first and the network refresh hasn't replaced it yet).
  static Future<CacheResult<List<AreaModel>>> getAreasCached() async {
    final cached = await DatabaseHelper.instance.getMapCache(_areasCacheKey);
    List<AreaModel>? parsedCache;
    if (cached != null) {
      try {
        parsedCache = (jsonDecode(cached) as List)
            .map((e) => AreaModel.fromJson(e as Map<String, dynamic>))
            .toList();
      } catch (_) {
        parsedCache = null; // corrupt entry — ignore, network will fix it
      }
    }

    try {
      final fresh = await getAreas();
      if (fresh != null) {
        await DatabaseHelper.instance.putMapCache(
          _areasCacheKey,
          jsonEncode(fresh.map((a) => a.toJson()).toList()),
        );
        return CacheResult(fresh, fromCache: false);
      }
      // Network path returned null (failure). Fall through to cache.
    } catch (_) {
      // Fall through to cache.
    }

    if (parsedCache != null) {
      return CacheResult(parsedCache, fromCache: true);
    }
    return const CacheResult(null, fromCache: true); // total failure, no cache
  }

  /// Cache-then-network variant of [getHexBins]. Cache key covers every
  /// request param (including the window mode) so different filters never
  /// collide.
  static Future<CacheResult<List<HexBin>>> getHexBinsCached({
    required String areaId,
    required DateTime selectedDate,
    required int week,
    required int threshold,
    String mode = 'month',
  }) async {
    final cacheKey = _hexBinsCacheKey(
      areaId: areaId,
      selectedDate: selectedDate,
      week: week,
      threshold: threshold,
      mode: mode,
    );

    final cached = await DatabaseHelper.instance.getMapCache(cacheKey);
    List<HexBin>? parsedCache;
    if (cached != null) {
      try {
        parsedCache = (jsonDecode(cached) as List)
            .map((e) => HexBin.fromJson(e as Map<String, dynamic>))
            .toList();
      } catch (_) {
        parsedCache = null;
      }
    }

    try {
      final fresh = await getHexBins(
        areaId: areaId,
        selectedDate: selectedDate,
        week: week,
        threshold: threshold,
        mode: mode,
      );
      await DatabaseHelper.instance.putMapCache(
        cacheKey,
        jsonEncode(fresh.map((h) => h.toJson()).toList()),
      );
      // Keep the cache bounded; the areas list must survive eviction.
      await DatabaseHelper.instance.trimMapCache(keep: {_areasCacheKey});
      return CacheResult(fresh, fromCache: false);
    } catch (_) {
      if (parsedCache != null) {
        return CacheResult(parsedCache, fromCache: true);
      }
      // Re-throw the original error so the UI can show its retryable error
      // state (mapview keeps stale bins itself for in-session failures).
      rethrow;
    }
  }
}

/// Payload + provenance for cache-then-network fetches.
class CacheResult<T> {
  final T? data;

  /// True when [data] came from the on-device cache. For callers this means:
  /// "show the data, but tell the user it may be stale".
  final bool fromCache;

  const CacheResult(this.data, {required this.fromCache});
}
