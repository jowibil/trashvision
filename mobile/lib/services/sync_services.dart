import 'package:TrashVision/models/report_model.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:jwt_decoder/jwt_decoder.dart';
import '../helper/database_helper.dart';
import 'api_client.dart';
import 'api_service.dart';

class SyncService {
  static final SyncService _instance = SyncService._internal();
  factory SyncService() => _instance;
  SyncService._internal();

  bool _isSyncing = false;

  /// Set by main.dart in initState: the app's global ScaffoldMessenger key,
  /// so sync results can surface one summary snackbar no matter which screen
  /// is up (or none — sync runs from the root too).
  static GlobalKey<ScaffoldMessengerState>? messengerKey;

  Future<void> syncOutbox() async {
    if (_isSyncing) return;

    // FIX: connectivity_plus v6's checkConnectivity() returns List<ConnectivityResult>,
    // not a single ConnectivityResult. The old `== ConnectivityResult.none` comparison
    // was always false, so this offline guard never actually fired.
    var connectivityResult = await Connectivity().checkConnectivity();
    if (connectivityResult.contains(ConnectivityResult.none)) return;

    // FIX (Step 3): never iterate the outbox without a valid session.
    // Previously an expired token meant every report failed 401 in a loop —
    // burning battery/data on doomed requests while reports sat in the
    // outbox with zero user feedback. (A 401 from an authenticated request
    // also latches + redirects via ApiClient; this check avoids triggering
    // that flow on a scheduled/connectivity sync at all.)
    final token = await ApiClient.authToken();
    if (token == null || JwtDecoder.isExpired(token)) return;

    _isSyncing = true;
    debugPrint("Sync Engine: Checking for pending reports...");

    int synced = 0;
    int failed = 0;
    bool authAborted = false;

    try {
      final List<Report> pendingReports = await DatabaseHelper.instance.getReports();

      for (var report in pendingReports) {
        // uploadReport returns the HTTP status (0 = network error).
        final status = await ApiService().uploadReport(report);
        final success = status == 200 || status == 201;

        if (success) {
          // FIX (audit #9 - "Offline profile ledger shows nothing"): this
          // used to be deleteReport(), which erased all trace of a report
          // the moment it synced. moveReportToLedger() archives it into
          // report_ledger instead, so Profile can always show full
          // history regardless of connectivity.
          await DatabaseHelper.instance.moveReportToLedger(report);
          synced++;
          debugPrint("Sync Engine: Report ${report.id} synced and moved to ledger.");
        } else {
          failed++;
          debugPrint("Sync Engine: Report ${report.id} failed to upload; kept in outbox.");
        }
      }
    } on ApiException catch (e) {
      // getReports()/moveReportToLedger() don't throw ApiException, so this
      // branch is for future callers; uploadReport surfaces 401 via the
      // status code below.
      debugPrint("Sync Engine API error: $e");
      if (e.statusCode == 401) {
        // Session died mid-run: stop immediately. The ApiClient latch has
        // already redirected to login with a snackbar, so no extra toast
        // here — the outbox stays intact for the next session.
        authAborted = true;
      }
    } catch (e) {
      debugPrint("Sync Engine Error: $e");
    } finally {
      _isSyncing = false;
    }

    _notifyResult(synced, failed, authAborted);
  }

  /// FIX (Step 3): failures were completely invisible — reports silently sat
  /// in the outbox forever. One summary snackbar per run; routine fully
  /// successful syncs stay quiet to avoid toast spam.
  void _notifyResult(int synced, int failed, bool authAborted) {
    if (authAborted) return; // the 401 redirect already informed the user
    if (synced == 0 && failed == 0) return;
    if (synced > 0 && failed == 0) return; // silent success keeps sync unobtrusive

    final messenger = messengerKey?.currentState;
    if (messenger == null) return;

    messenger.showSnackBar(
      SnackBar(
        content: Text(
          "$failed report${failed != 1 ? 's' : ''} couldn't sync — they'll retry automatically.",
        ),
      ),
    );
  }
}
