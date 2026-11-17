import 'package:TrashVision/models/report_model.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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

    var connectivityResult = await Connectivity().checkConnectivity();
    if (connectivityResult.contains(ConnectivityResult.none)) return;

    final token = await ApiClient.authToken();
    if (token == null || JwtDecoder.isExpired(token)) return;

    // Guest mode: reports filed while signed out are queued with the
    // 'guest' placeholder, because the backend takes report ownership from
    // the JWT rather than the form. A session exists now, so claim them for
    // this account BEFORE uploading — otherwise they would sync but never
    // show up in this account's Profile ledger.
    final ownerId = await const FlutterSecureStorage().read(key: 'user_id');
    if (ownerId == null || ownerId.isEmpty) {
      // A valid token but no stored account id: there is no way to tell which
      // queued rows are this person's, and guessing would upload someone
      // else's report as theirs. Wait for a sign-in that stamps the id.
      debugPrint("Sync Engine: no stored user_id; skipping outbox.");
      return;
    }
    await DatabaseHelper.instance.adoptGuestReports(ownerId);

    _isSyncing = true;
    debugPrint("Sync Engine: Checking for pending reports...");

    int synced = 0;
    int failed = 0;
    bool authAborted = false;

    try {
      // Shared devices: upload ONLY the signed-in account's reports. Every
      // row used to be sent under whatever token happened to be live, so
      // signing in as B could publish A's still-queued report as B's (the
      // server assigns ownership from the JWT). Rows owned by another account
      // stay queued, untouched, for that account's own next sign-in.
      final List<Report> pendingReports =
          await DatabaseHelper.instance.getReportsByUserId(ownerId);

      for (var report in pendingReports) {
        // uploadReport returns the HTTP status (0 = network error).
        final status = await ApiService().uploadReport(report);
        final success = status == 200 || status == 201;

        if (success) {
          await DatabaseHelper.instance.moveReportToLedger(report);
          synced++;
          debugPrint("Sync Engine: Report ${report.id} synced and moved to ledger.");
        } else {
          failed++;
          debugPrint("Sync Engine: Report ${report.id} failed to upload; kept in outbox.");
        }
      }
    } on ApiException catch (e) {
      // getReportsByUserId()/moveReportToLedger() don't throw ApiException, so this
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
