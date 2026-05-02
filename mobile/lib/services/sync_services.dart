import 'package:TrashVision/models/report_model.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../helper/database_helper.dart';
import 'api_service.dart';

class SyncService {
  static final SyncService _instance = SyncService._internal();
  factory SyncService() => _instance;
  SyncService._internal();

  bool _isSyncing = false;

  Future<void> syncOutbox() async {
    if (_isSyncing) return;
    
    var connectivityResult = await Connectivity().checkConnectivity();
    if (connectivityResult == ConnectivityResult.none) return;

    _isSyncing = true;
    print("Sync Engine: Checking for pending reports...");

    try {
      final List<Report> pendingReports = await DatabaseHelper.instance.getReports();

      for (var report in pendingReports) {
        bool success = await ApiService().uploadReport(report);
        
        if (success) {
          // IMPORTANT: Only delete from SQLite if Backend confirmed receipt
          await DatabaseHelper.instance.deleteReport(report.id!);
          print("Sync Engine: Report ${report.id} synced and removed from local.");
        }
      }
    } catch (e) {
      print("Sync Engine Error: $e");
    } finally {
      _isSyncing = false;
    }
  }
}