import 'package:TrashVision/models/report_model.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('reports.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    // FIX (audit #9 - "Offline profile ledger"): bumped to version 3 to add
    // report_ledger, a separate table for reports that have already synced
    // to the server. Previously, a synced report was just deleted from
    // report_outbox with no other record kept on-device, so an offline user
    // opening Profile saw only whatever was still pending upload — anything
    // that had ever successfully synced simply vanished from their history
    // until they reconnected.
    // v4: adds map_cache — durable JSON cache of map API responses (areas,
    // hexbins) so the map opens offline with stale data (offline-first).
    return await openDatabase(path, version: 4, onCreate: _createDB, onUpgrade: _upgradeDB);
  }

  static const String _ledgerTableSql = '''CREATE TABLE report_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      waste_type TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      user_id TEXT NOT NULL,
      area_id TEXT,
      local_photo_path TEXT,
      description TEXT,
      created_at TIMESTAMP,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );''';

  Future _createDB(Database db, int version) async {
    await db.execute(_mapCacheTableSql);
    await db.execute('''CREATE TABLE report_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      waste_type TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      user_id TEXT NOT NULL,
      area_id TEXT,
      local_photo_path TEXT,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );''');
    await db.execute(_ledgerTableSql);
  }

  Future _upgradeDB(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await db.execute('ALTER TABLE report_outbox ADD COLUMN is_critical INTEGER NOT NULL DEFAULT 0;');
    }
    if (oldVersion < 3) {
      await db.execute(_ledgerTableSql);
    }
    if (oldVersion < 4) {
      await db.execute(_mapCacheTableSql);
    }
  }

  /// General-purpose key/value cache for map API payloads (offline-first).
  /// Values are JSON strings of the response; keys are deterministic
  /// request-identifiers (see MobileMapService).LRU-ish: updated_at is bumped
  /// on every write, and trimMapCache() keeps only the most recent entries.
  static const String _mapCacheTableSql = '''CREATE TABLE map_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );''';

  /// Reads a cached map payload. Returns null on miss. Never throws — a
  /// corrupt cache entry must not break the offline path.
  Future<String?> getMapCache(String cacheKey) async {
    try {
      final db = await instance.database;
      final rows = await db.query(
        'map_cache',
        columns: ['payload'],
        where: 'cache_key = ?',
        whereArgs: [cacheKey],
        limit: 1,
      );
      if (rows.isEmpty) return null;
      return rows.first['payload'] as String;
    } catch (_) {
      return null;
    }
  }

  /// Upserts a cached map payload and refreshes updated_at.
  Future<void> putMapCache(String cacheKey, String payload) async {
    try {
      final db = await instance.database;
      await db.insert(
        'map_cache',
        {
          'cache_key': cacheKey,
          'payload': payload,
          'updated_at': DateTime.now().toIso8601String(),
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    } catch (_) {
      // Cache writes are best-effort; storage failures must not crash the app.
    }
  }

  /// Keeps the cache bounded: after inserting, drop everything but the
  /// [maxEntries] most-recently-updated keys (excludes [keep] so the areas
  /// list is never evicted by hexbin churn).
  Future<void> trimMapCache({int maxEntries = 24, Set<String> keep = const {}}) async {
    try {
      final db = await instance.database;
      await db.delete(
        'map_cache',
        where: 'cache_key NOT IN (${List.filled(keep.length, '?').join(',')})'
            ' AND cache_key NOT IN (SELECT cache_key FROM map_cache'
            ' ORDER BY updated_at DESC LIMIT ?)',
        whereArgs: [...keep, maxEntries],
      );
    } catch (_) {
      // Best-effort.
    }
  }

  /// Wipes the map cache (e.g. "reset offline data" action or after a
  /// backend contract change).
  Future<void> clearMapCache() async {
    try {
      final db = await instance.database;
      await db.delete('map_cache');
    } catch (_) {
      // Best-effort.
    }
  }

  Future<int> insertReport(Report report) async {
    final db = await instance.database;
    return await db.insert(
      'report_outbox',
      report.toSqlMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Report>> getReports() async {
    final db = await instance.database;
    final result = await db.query('report_outbox', orderBy: 'created_at DESC');
    return result.map((json) => Report.fromSql(json)).toList();
  }

  /// MISSING METHOD: Query filtered offline caches to feed user_profile.dart UI
  Future<List<Report>> getReportsByUserId(String userId) async {
    final db = await instance.database;
    final result = await db.query(
      'report_outbox',
      where: 'user_id = ?',
      whereArgs: [userId],
      orderBy: 'created_at DESC',
    );
    return result.map((json) => Report.fromSql(json)).toList();
  }

  Future<void> deleteReport(int id) async {
    final db = await instance.database;
    await db.delete('report_outbox', where: 'id = ?', whereArgs: [id]);
  }

  /// FIX (audit #9): archives a successfully-synced report into
  /// report_ledger and removes it from report_outbox, in one transaction so
  /// a crash mid-move can't duplicate or drop the record. Called from
  /// sync_services.dart right after a successful upload.
  Future<void> moveReportToLedger(Report report) async {
    final db = await instance.database;
    await db.transaction((txn) async {
      await txn.insert(
        'report_ledger',
        report.toSqlMap()..remove('id'), // ledger has its own autoincrement id
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
      if (report.id != null) {
        await txn.delete('report_outbox', where: 'id = ?', whereArgs: [report.id]);
      }
    });
  }

  /// FIX (audit #9): lets Profile show synced history even while offline,
  /// since those reports no longer live in report_outbox once synced.
  Future<List<Report>> getLedgerReportsByUserId(String userId) async {
    final db = await instance.database;
    final result = await db.query(
      'report_ledger',
      where: 'user_id = ?',
      whereArgs: [userId],
      orderBy: 'synced_at DESC',
    );
    return result.map((json) => Report.fromSql(json)).toList();
  }

  /// Profile helper: merged newest-first mix of pending outbox reports and
  /// synced ledger reports for one user. Pending rows have syncedAt == null
  /// (report_ledger always sets it), which is exactly what the UI needs to
  /// tag "Pending sync" vs "Synced" — no extra flag column in either table.
  /// createdAt falls back to synced_at for ledger rows so the sort can't
  /// collapse ties to insertion order.
  Future<List<Report>> getAllReportsByUserIdMerged(String userId) async {
    final pending = await getReportsByUserId(userId);
    final synced = await getLedgerReportsByUserId(userId);
    final merged = [...pending, ...synced];
    merged.sort((a, b) {
      final aTime = a.createdAt ?? a.syncedAt ?? DateTime(0);
      final bTime = b.createdAt ?? b.syncedAt ?? DateTime(0);
      return bTime.compareTo(aTime);
    });
    return merged;
  }
}