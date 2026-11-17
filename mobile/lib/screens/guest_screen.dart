import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../config/theme.dart';
import '../helper/database_helper.dart';
import 'report_screen.dart';

/// Signed-out landing surface: shown when a session ends, and offered from the
/// login screen under "Continue as guest" so a first-time visitor can report
/// without creating an account.
///
/// An expired token used to drop the user straight on the login form, which
/// silently threw away the one thing the app can still do with no server at
/// all: file a report. Guest mode keeps that path open — the report lands in
/// the offline outbox tagged with `Report.guestUserId` and is uploaded the
/// moment the user signs in (SyncService adopts the row first). The server
/// never sees the placeholder: POST /reports/ takes ownership from the JWT.
class GuestScreen extends StatefulWidget {
  const GuestScreen({super.key});

  @override
  State<GuestScreen> createState() => _GuestScreenState();
}

class _GuestScreenState extends State<GuestScreen> {
  /// Guest reports sitting in the outbox from earlier visits.
  int _pending = 0;

  @override
  void initState() {
    super.initState();
    _loadPending();
  }

  Future<void> _loadPending() async {
    final pending = await DatabaseHelper.instance.countGuestReports();
    if (!mounted) return;
    setState(() => _pending = pending);
  }

  Future<void> _openReport() async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const ReportScreen(guest: true)),
    );
    // Back from a submission (or a cancelled form): refresh the waiting count.
    await _loadPending();
  }

  void _openLogin() {
    Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'TrashVision',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: primaryBlue,
                  ),
                ),
                const SizedBox(height: 8),
                // Neutral on purpose: this screen is reached both after an
                // expiry and straight from the login screen.
                const Text(
                  "You're signed out",
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: Colors.black54),
                ),
                const SizedBox(height: 32),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: surfaceLight,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: surfaceBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            LucideIcons.cloudOff,
                            size: 20,
                            color: warningAmber,
                          ),
                          const SizedBox(width: 10),
                          const Expanded(
                            child: Text(
                              'You can still report trash',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                                color: ink,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Take the photo and drop the pin now. The report is saved on this '
                        'phone — with the location stamped on the photo — and uploads the '
                        'next time you sign in.',
                        style: TextStyle(
                          fontSize: 13,
                          height: 1.45,
                          color: inkMuted,
                        ),
                      ),
                      if (_pending > 0) ...[
                        const SizedBox(height: 14),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: warningAmber.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '$_pending report${_pending == 1 ? '' : 's'} waiting to upload',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: warningAmber,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: _openReport,
                    icon: const Icon(
                      LucideIcons.camera,
                      color: Colors.white,
                      size: 20,
                    ),
                    label: const Text(
                      'Report trash now',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primaryBlue,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 52,
                  child: OutlinedButton(
                    onPressed: _openLogin,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: primaryBlue,
                      side: const BorderSide(color: surfaceBorder),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text(
                      'Log in',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Guest reports are filed under the account you sign into.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, color: inkFaint),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
