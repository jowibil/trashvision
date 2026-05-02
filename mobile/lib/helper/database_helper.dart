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

    return await openDatabase(path, version: 1, onCreate: _createDB);
  }

  Future _createDB(Database db, int verison) async {
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
    );
    ''');
  }

  Future<int> insertReport(Report report) async {
    final db = await instance.database;
    return await db.insert(
      'report_outbox',
      report.toSqlMap(), //
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Report>> getReports() async {
    final db = await instance.database;
    final result = await db.query('report_outbox');
    return result.map((json) => Report.fromSql(json)).toList();
  }
  Future<void> deleteReport(int id) async {
    final db = await instance.database;

    await db.delete('report_outbox', where: 'id = ?', whereArgs: [id]);
  }
}
