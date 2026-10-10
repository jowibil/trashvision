// lib/screens/user_profile_screen.dart

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../helper/database_helper.dart';
import '../services/api_service.dart';
import '../models/report_model.dart';
import '../widgets/bottom_nav.dart';

class UserProfileScreen extends StatefulWidget {
  const UserProfileScreen({super.key});

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  final storage = const FlutterSecureStorage();

  String? _userId;
  String? _userName;
  String? _userEmail;
  
  List<Report> _submittedReports = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadProfileAndReports();
  }

  Future<void> _loadProfileAndReports() async {
    setState(() => _isLoading = true);
    try {
      final cachedId = await storage.read(key: "user_id");
      String? currentName = await storage.read(key: "user_name");
      String? currentEmail = await storage.read(key: "user_email");

      setState(() {
        _userId = cachedId;
        _userName = currentName ?? "Community Citizen";
        _userEmail = currentEmail ?? "citizen@trashvision.org";
      });

      if (_userId != null) {
        var connectivityResult = await Connectivity().checkConnectivity();
        
        if (!connectivityResult.contains(ConnectivityResult.none)) {
          try {
            final profileData = await ApiService().getUserProfile(_userId!);
            if (profileData != null) {
              currentName = profileData['name'];
              currentEmail = profileData['email'];

              await storage.write(key: "user_name", value: currentName);
              await storage.write(key: "user_email", value: currentEmail);
            }
          } catch (apiError) {
            debugPrint("Failed to sync profile metrics: $apiError");
          }
        }

        setState(() {
          _userName = currentName ?? "Community Citizen";
          _userEmail = currentEmail ?? "citizen@trashvision.org";
        });

        await _fetchUserLogs();
      }
    } catch (e) {
      debugPrint("Profile state error: $e");
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _fetchUserLogs() async {
    var connectivityResult = await Connectivity().checkConnectivity();
    List<Report> logs = [];

    // FIX (audit #9 - "Offline profile ledger shows nothing"): a synced
    // report is removed from report_outbox (see moveReportToLedger), so
    // reading only getReportsByUserId here would show pending reports but
    // silently drop everything that had ever successfully synced while
    // offline. The merged helper returns outbox (pending, syncedAt == null)
    // + ledger (synced) newest-first; the syncedAt field lets the UI tag
    // each row "Pending sync" vs "Synced" instead of rendering them
    // identically.
    if (connectivityResult.contains(ConnectivityResult.none)) {
      logs = await DatabaseHelper.instance.getAllReportsByUserIdMerged(_userId!);
    } else {
      try {
        logs = await ApiService().getUserReports(_userId!);
      } catch (e) {
        logs = await DatabaseHelper.instance.getAllReportsByUserIdMerged(_userId!);
      }
    }

    if (mounted) {
      setState(() {
        _submittedReports = logs;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        title: const Text(
          "My Clean-Up Profile", 
          style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: -0.5, color: Colors.white)
        ),
        backgroundColor: const Color(0xFF005D90),
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.refreshCw, size: 20),
            color: Colors.white,
            onPressed: _loadProfileAndReports,
            tooltip: "Force-sync network graph data",
          )
        ],
      ),
      body: _isLoading 
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF005D90)),
              ),
            )
          : Column(
              children: [
                _buildHeroProfileHeader(),
                Expanded(
                  child: _buildHistoryPane(),
                ),
              ],
            ),
      bottomNavigationBar: const BottomNavBar(currentIndex: 3),
    );
  }

  Widget _buildHeroProfileHeader() {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: Color(0xFF005D90),
        borderRadius: BorderRadius.only(
          bottomLeft: Radius.circular(32),
          bottomRight: Radius.circular(32),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 70,
                height: 70,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.blue[100]!, width: 3),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.1),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    )
                  ],
                ),
                child: const Icon(LucideIcons.user, size: 36, color: Color(0xFF005D90)),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _userName ?? "Community Citizen",
                      style: const TextStyle(
                        fontSize: 22, 
                        fontWeight: FontWeight.w900, 
                        color: Colors.white,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _userEmail ?? "citizen@trashvision.org",
                      style: TextStyle(
                        fontSize: 13, 
                        color: Colors.blue[100], 
                        fontWeight: FontWeight.w500
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          _buildMetricTile(
            // Honest counts: "submissions" previously included rows still
            // sitting in the offline outbox, which had never left the device.
            count: _syncedCount.toString(),
            label: "Synced reports",
            icon: LucideIcons.fileText,
            color: Colors.white24,
          ),
          const SizedBox(height: 10),
          if (_pendingCount > 0) _buildPendingTile(),
        ],
      ),
    );
  }

  Widget _buildMetricTile({
    required String count, 
    required String label, 
    required IconData icon, 
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.white, size: 22),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                count,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: Colors.blue[100],
                ),
              ),
            ],
          )
        ],
      ),
    );
  }

  // Pending rows (report_outbox) have syncedAt == null; ledger rows always
  // carry it. Server-fetched rows never have it either, but those are by
  // definition already on the server.
  int get _pendingCount => _submittedReports.where((r) => r.syncedAt == null).length;
  int get _syncedCount => _submittedReports.length - _pendingCount;

  /// Amber tile shown only while reports await upload — makes the offline
  /// pending state visible at a glance instead of hiding inside the total.
  Widget _buildPendingTile() {
    return _buildMetricTile(
      count: _pendingCount.toString(),
      label: "Pending sync",
      icon: LucideIcons.clock,
      color: Colors.black.withValues(alpha: 0.15),
    );
  }

  Widget _buildHistoryPane() {
    if (_submittedReports.isEmpty) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(LucideIcons.folderOpen, size: 48, color: Colors.grey[300]),
              const SizedBox(height: 12),
              const Text(
                "Your reporting ledger is clean.",
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Color(0xFF94A3B8)),
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      // Pull-to-refresh re-runs the merged outbox+ledger query so the sync
      // mix (and the pending count) is current without leaving the screen.
      onRefresh: _loadProfileAndReports,
      color: const Color(0xFF005D90),
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        itemCount: _submittedReports.length,
        itemBuilder: (context, index) {
          return _buildReportCardNode(_submittedReports[index]);
        },
      ),
    );
  }

  /// Amber "Pending sync" chip for outbox rows, neutral "Synced" chip for
  /// ledger rows — the offline visibility contract: the user can always tell
  /// which of their reports haven't reached the server yet.
  Widget _buildSyncStateChip(Report report) {
    final isPending = report.syncedAt == null;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: isPending ? Colors.amber.shade100 : const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isPending ? LucideIcons.clock : LucideIcons.checkCircle2,
            size: 10,
            color: isPending ? Colors.amber.shade800 : const Color(0xFF64748B),
          ),
          const SizedBox(width: 4),
          Text(
            isPending ? "Pending sync" : "Synced",
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: isPending ? Colors.amber.shade900 : const Color(0xFF64748B),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReportCardNode(Report report) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFF1F5F9)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 8,
            offset: const Offset(0, 4),
          )
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 110,
              color: const Color(0xFFF1F5F9),
              child: Builder(
                builder: (context) {
                  final hasValidLocalFile = report.localPhotoPath != null && 
                      File(report.localPhotoPath!).existsSync();
                  final hasValidRemoteUrl = report.photoUrl != null && 
                      report.photoUrl!.isNotEmpty;

                  if (hasValidLocalFile) {
                    return Image.file(
                      File(report.localPhotoPath!),
                      fit: BoxFit.cover,
                    );
                  } else if (hasValidRemoteUrl) {
                    return Image.network(
                      report.photoUrl!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const Center(
                        child: Icon(LucideIcons.image, color: Color(0xFF94A3B8), size: 24),
                      ),
                    );
                  } else {
                    return const Center(
                      child: Icon(LucideIcons.image, color: Color(0xFF94A3B8), size: 24),
                    );
                  }
                },
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            report.wasteType.replaceAll('_', ' ').toUpperCase(),
                            style: const TextStyle(
                              fontSize: 12, 
                              fontWeight: FontWeight.w900, 
                              color: Color(0xFF005D90),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        _buildSyncStateChip(report),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      report.description.isNotEmpty 
                          ? report.description 
                          : "No programmatic context summary submitted.",
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: Color(0xFF475569), height: 1.3),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Icon(LucideIcons.mapPin, size: 12, color: Colors.blue[700]),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            "Lat: ${report.latitude.toStringAsFixed(4)}, Lng: ${report.longitude.toStringAsFixed(4)}",
                            style: const TextStyle(
                              fontSize: 11, 
                              fontFamily: 'monospace', 
                              color: Color(0xFF94A3B8),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}