import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// A durable, offline-friendly replacement for flutter_map's built-in tile
/// cache.
///
/// WHY THIS EXISTS (audited flutter_map 8.3.0 source):
/// `NetworkTileProvider` ships with `BuiltInMapCachingProvider` enabled by
/// default, so tiles ARE written to disk. However, in
/// `NetworkTileImageProvider._loadImage`, any network failure (`ClientException`)
/// calls `evict()` and rethrows — meaning a stale-but-present tile is DELETED
/// the first time it fails to refresh offline. The built-in cache is therefore
/// useless for real offline use once tiles go stale (Mapbox sends short
/// `max-age` values).
///
/// This provider changes two things:
///  1. **Stale tiles stay readable.** `getTile` never deletes anything; a
///     cache hit always returns bytes. We report `staleAt` far in the future
///     so the network path is skipped entirely for cached tiles (Mapbox raster
///     tiles for surveyed areas barely change; freshness is handled by
///     [MapOfflineTileCache.clear] + app updates, not per-session HTTP).
///  2. **Durable storage.** Tiles go in the application SUPPORT directory
///     (not the OS cache dir), so Android/iOS won't silently wipe them. A
///     size cap with oldest-first eviction keeps it bounded.
///
/// Cache keys are derived from the tile URL with volatile query params
/// (`access_token`) stripped, and hashed to a flat filename — stable across
/// app restarts, unlike uuid-v5 keys which are also stable but unnecessary.
class MapOfflineTileCache with ChangeNotifier implements MapCachingProvider {
  MapOfflineTileCache._();

  static MapOfflineTileCache? _instance;
  static MapOfflineTileCache get instance => _instance ??= MapOfflineTileCache._();

  /// Tiles are served from cache without a network round-trip for this long.
  /// Chosen deliberately long: drone-survey basemaps don't change meaningfully,
  /// and revalidation of every tile would defeat offline usage.
  static const Duration _freshDuration = Duration(days: 90);

  /// Approximate cache ceiling. ~150 MB is plenty for several surveyed areas
  /// at zoom 10-18 with 512px tiles, while staying polite to device storage.
  static const int _maxCacheBytes = 150 * 1024 * 1024;

  /// Fraction of [_maxCacheBytes] evicted (oldest files first) when the cap
  /// is exceeded, so eviction isn't triggered on every write afterwards.
  static const double _evictFraction = 0.2;

  Directory? _dir;
  Future<void>? _ready;

  /// Tracks cumulative written bytes between scans so we don't stat the whole
  /// directory on every tile write.
  int _approxBytes = 0;

  /// Increments on every cache-wide mutation (clear/evict). Map screens can
  /// listen and rebuild their TileLayer when the cache meaningfully changes.
  int generation = 0;

  bool get isReady => _dir != null;

  /// Initialises the cache directory. Safe to call multiple times; the work
  /// is done at most once. Called lazily on first tile access if not called
  /// explicitly.
  Future<void> ensureReady() {
    return _ready ??= () async {
      final base = await getApplicationSupportDirectory();
      _dir = Directory(p.join(base.path, 'map_tile_cache'));
      await _dir!.create(recursive: true);
      await _recomputeApproxSize();
    }();
  }

  @override
  bool get isSupported => true;

  /// Stable, filesystem-safe cache key for a tile URL.
  ///
  /// Volatile query params (access_token) are stripped first so rotating
  /// tokens don't fragment the cache.
  @visibleForTesting
  static String cacheKeyFor(String url) {
    final uri = Uri.tryParse(url);
    final Map<String, String> cleanQuery = {};
    if (uri != null) {
      uri.queryParameters.forEach((k, v) {
        if (k != 'access_token') cleanQuery[k] = v;
      });
    }
    final clean = uri == null
        ? url
        : uri.replace(queryParameters: cleanQuery.isEmpty ? null : cleanQuery).toString();
    return clean.hashCode.toUnsigned(63).toRadixString(36);
  }

  File? _fileFor(String url) {
    final dir = _dir;
    if (dir == null) return null;
    return File(p.join(dir.path, cacheKeyFor(url)));
  }

  @override
  Future<({Uint8List bytes, CachedMapTileMetadata metadata})?> getTile(String url) async {
    await ensureReady();
    final file = _fileFor(url);
    if (file == null || !await file.exists()) return null;

    // Header line: "staleAtMillis epoch" then raw tile bytes.
    // (Same idea as flutter_map's own tile file format, kept simpler: we only
    // need staleAt; etag/lastModified are unused because we never revalidate.)
    try {
      final bytes = await file.readAsBytes();
      if (bytes.length < 32) return null; // corrupt/too short — treat as miss

      final headerEnd = bytes.indexOf(0x0A); // '\n'
      if (headerEnd < 0) return null;

      final header = const AsciiDecoder(allowInvalid: true).convert(bytes, 0, headerEnd);
      final staleAtMillis = int.tryParse(header.trim());
      if (staleAtMillis == null) return null;

      return (
        bytes: Uint8List.sublistView(bytes, headerEnd + 1),
        metadata: CachedMapTileMetadata(
          staleAt: DateTime.fromMillisecondsSinceEpoch(staleAtMillis, isUtc: true),
          lastModified: null,
          etag: null,
        ),
      );
    } catch (_) {
      // Corrupt read: report a miss (do NOT delete — deleting on read is the
      // exact behavior that makes the built-in cache fail offline).
      return null;
    }
  }

  @override
  Future<void> putTile({
    required String url,
    required CachedMapTileMetadata metadata,
    Uint8List? bytes,
  }) async {
    await ensureReady();
    final file = _fileFor(url);
    if (file == null || bytes == null || bytes.isEmpty) return;

    // Ignore the incoming metadata's staleness (server may say 5 minutes);
    // our freshness policy rules this cache.
    final staleAt = DateTime.timestamp().add(_freshDuration);
    final header = latin1.encode('${staleAt.millisecondsSinceEpoch}\n');

    try {
      await file.writeAsBytes([...header, ...bytes], flush: false);
      _approxBytes += header.length + bytes.length;
      unawaited(_evictIfNeeded());
    } catch (_) {
      // Disk full or IO error: caching is best-effort; never break tile load.
    }
  }

  /// Deletes every cached tile (e.g. a "reset offline map data" action, or
  /// after an app update changes the tile style/template).
  Future<void> clear() async {
    await ensureReady();
    final dir = _dir;
    if (dir == null) return;
    if (await dir.exists()) {
      await for (final entity in dir.list()) {
        if (entity is File) {
          try {
            await entity.delete();
          } catch (_) {}
        }
      }
    }
    _approxBytes = 0;
    generation++;
    notifyListeners();
  }

  Future<void> _recomputeApproxSize() async {
    final dir = _dir;
    if (dir == null) return;
    int total = 0;
    await for (final entity in dir.list()) {
      if (entity is File) {
        try {
          total += await entity.length();
        } catch (_) {}
      }
    }
    _approxBytes = total;
  }

  Future<void> _evictIfNeeded() async {
    if (_approxBytes <= _maxCacheBytes) return;
    final dir = _dir;
    if (dir == null) return;

    // Oldest-last-modified first.
    final files = <File, DateTime>{};
    await for (final entity in dir.list()) {
      if (entity is File) {
        try {
          files[entity] = (await entity.stat()).modified;
        } catch (_) {}
      }
    }
    final target = (_maxCacheBytes * (1 - _evictFraction)).toInt();
    final ordered = files.entries.toList()..sort((a, b) => a.value.compareTo(b.value));
    int removed = 0;
    for (final entry in ordered) {
      if (_approxBytes - removed <= target) break;
      final size = await entry.key.length().catchError((_) => 0);
      try {
        await entry.key.delete();
        removed += size;
      } catch (_) {}
    }
    _approxBytes -= removed;
    if (removed > 0) {
      generation++;
      notifyListeners();
    }
  }

  /// Total bytes currently used (approximate; recomputed on init).
  Future<int> approxSizeBytes() async {
    await ensureReady();
    return _approxBytes;
  }

  @override
  void dispose() {
    _instance = null;
    super.dispose();
  }
}
