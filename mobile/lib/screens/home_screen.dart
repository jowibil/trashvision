import 'package:TrashVision/widgets/bottom_nav.dart';
import 'package:flutter/material.dart';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
// import 'report_screen.dart';
import '../helper/database_helper.dart';
import '../helper/gps_helper.dart';
import '../services/api_service.dart';
import '../widgets/alert_card.dart';
import '../widgets/connectivity_status.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final ImagePicker _picker = ImagePicker();
  final storage = const FlutterSecureStorage();

  String? name;
  String? role;

  // FIX (audit #10 - "Mock analytics on Home"): "1,248 kg" / "94.2%" / the
  // bar chart used to be hardcoded literals. These now come from
  // GET /logs/summary via ApiService.getLogsSummary().
  bool _analyticsLoading = true;
  int? _totalDetections;
  int? _hotspotZones;
  List<int> _weeklyTrends = [];

  // Offline-first: the last successful /logs/summary response is persisted
  // in the generic map_cache store (same cache-then-network pattern the map
  // screen uses), so an offline user sees last-known numbers instead of a
  // blank dashboard. _fromCache marks stale provenance for the tokenation.
  static const String _logsSummaryCacheKey = 'logs_summary_v1';
  bool _fromCache = false;

  // App-wide unified style tokens matching user_profile specs
  static const Color primaryColor = Color(0xFF005D90);
  static const Color slateCardBorder = Color(0xFFF1F5F9);
  static const Color textMutedColor = Color(0xFF94A3B8);
  static const Color textDarkColor = Color(0xFF475569);

  @override
  void initState() {
    super.initState();
    _loadUserData();
    _loadAnalytics();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkForLostCameraData();
    });
    checkLocationServices();
  }

  Future<void> _checkForLostCameraData() async {
    final LostDataResponse response = await _picker.retrieveLostData();
    if (response.isEmpty) return;

    if (response.file != null) {
      if (!mounted) return;
      Navigator.pushReplacementNamed(
        context, 
        '/report', 
        arguments: response.file!.path
      );
    }
  }

  Future<void> _loadUserData() async {
    // FIX: auth_service.dart used to write the display name under key
    // "name"; it now writes "user_name" (matching user_profile_screen.dart),
    // so this read needs to match or the header always shows the fallback.
    final storedName = await storage.read(key: "user_name");
    final storedRole = await storage.read(key: "role");

    if (mounted) {
      setState(() {
        name = storedName;
        role = storedRole;
      });
    }
  }

  /// Applies a /logs/summary payload (fresh or cached) into the
  /// tile/chart state. Response shape confirmed against
  /// backend/routes/logs.py's get_dashboard_summary(): total_detections
  /// (int), weekly_trends (flat list of 7 ints, Mon to Sun),
  /// hotspot_zones (list of {id, name, date, severity} maps).
  void _applySummary(Map<String, dynamic> summary, {required bool fromCache}) {
    // FIX: previously expected weekly_trends as [{day/label, count/value}]
    // and discarded every entry since the backend actually returns a flat
    // list of ints (one count per weekday, Mon to Sun) — the chart
    // silently stayed empty even with real data.
    final rawTrends = summary['weekly_trends'];
    final trends = <int>[];
    if (rawTrends is List) {
      for (final entry in rawTrends) {
        trends.add(entry is num ? entry.round() : 0);
      }
    }

    final rawHotspots = summary['hotspot_zones'];
    final hotspotCount = rawHotspots is List ? rawHotspots.length : null;

    _totalDetections = summary['total_detections'] is int ? summary['total_detections'] as int : null;
    _hotspotZones = hotspotCount;
    _weeklyTrends = trends;
    _fromCache = fromCache;
  }

  /// FIX (audit #10): replaces the hardcoded dashboard numbers with a real
  /// fetch from GET /logs/summary via ApiService.getLogsSummary().
  ///
  /// Offline-first (cache-then-network, same pattern as the map screen):
  /// the last successful response is persisted in map_cache, applied
  /// immediately if present (stale, "Cached"), then revalidated against
  /// the network; on success the tiles flip back to "Live". A network
  /// failure with no cache renders the honest N/A state — never
  /// unhealthy-looking empty data.
  Future<void> _loadAnalytics() async {
    if (mounted) setState(() => _analyticsLoading = true);
    try {
      // Stale-on-open: show cached numbers instantly if we have them.
      Map<String, dynamic>? cached;
      final raw = await DatabaseHelper.instance.getMapCache(_logsSummaryCacheKey);
      if (raw != null) {
        try {
          final decoded = jsonDecode(raw);
          if (decoded is Map<String, dynamic>) cached = decoded;
        } catch (_) {
          cached = null; // corrupt entry — ignore, the network path re-writes it
        }
      }
      if (cached != null && mounted) {
        _applySummary(cached, fromCache: true);
        setState(() => _analyticsLoading = false);
      }

      // Revalidate in the background; success flips the tiles to "Live".
      final summary = await ApiService().getLogsSummary();
      if (summary != null) {
        await DatabaseHelper.instance.putMapCache(
          _logsSummaryCacheKey,
          jsonEncode(summary),
        );
        // Keep the cache bounded; areas_v1 and the dashboard summary
        // survive eviction (same guards the map fetches apply to areas_v1).
        await DatabaseHelper.instance.trimMapCache(keep: {'areas_v1', _logsSummaryCacheKey});
        if (mounted) {
          _applySummary(summary, fromCache: false);
          setState(() => _analyticsLoading = false);
        }
      } else if (cached == null && mounted) {
        // Network failed AND no cache: render the honest empty state.
        setState(() => _analyticsLoading = false);
      }
    } catch (e) {
      debugPrint("Analytics load error: $e");
      if (mounted) setState(() => _analyticsLoading = false);
    }
  }

  /// Chip provenance for the metric tiles: "Cached" replaces "Live" when
  /// the numbers came from the on-device map_cache (offline or failed
  /// refresh). The weekly chart card carries the matching caption.
  String _trendChipLabel() {
    if (_analyticsLoading) return "...";
    return _fromCache ? "Cached" : "Live";
  }

  Color _trendChipColor(Color liveColor) {
    return _fromCache ? textMutedColor : liveColor;
  }

  void handleLogout() async {
    await storage.deleteAll();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, '/login', (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50], // Consistent with user_profile_screen backplate
      appBar: AppBar(
        backgroundColor: primaryColor,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          "TrashVision",
          style: TextStyle(
            fontWeight: FontWeight.w900,
            color: Colors.white,
            letterSpacing: -0.5,
          ),
        ),
        actions: [
          IconButton(
            onPressed: handleLogout,
            icon: const Icon(Icons.logout, color: Colors.white, size: 22),
            tooltip: "Secure Sign Out",
          ),
        ],
      ),
      body: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildWelcomeHeader(),
            const SizedBox(height: 24),
            _buildQuickActionGrid(),
            const SizedBox(height: 28),
            _buildAnalyticsSection(),
            const SizedBox(height: 28),
            const AlertsCard(),
          ],
        ),
      ),
      bottomNavigationBar: const BottomNavBar(currentIndex: 0),
    );
  }

  Widget _buildWelcomeHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "Welcome back,",
          style: TextStyle(fontSize: 15, color: Colors.grey[600], fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 2),
        Text(
          name ?? "Community Citizen",
          style: const TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w900,
            color: primaryColor,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: primaryColor.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            (role ?? "community").toUpperCase(),
            style: const TextStyle(
              fontSize: 11,
              color: primaryColor,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.5,
            ),
          ),
        ),
        const SizedBox(height: 10),
        const Align(
          alignment: Alignment.centerLeft,
          child: ConnectivityStatusChip(),
        ),
      ],
    );
  }

  Widget _buildQuickActionGrid() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          "OPERATIONAL SHORTCUTS",
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: textMutedColor, letterSpacing: 0.8),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _buildActionCard(
                icon: Icons.report_problem,
                title: "File Report",
                color: Colors.amber[700]!,
                onTap: () => Navigator.pushReplacementNamed(context, '/report'),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: _buildActionCard(
                icon: Icons.map,
                title: "View Map",
                color: primaryColor,
                onTap: () => Navigator.pushReplacementNamed(context, '/map'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        // Chat assistant (brief Task 4): CCia, same endpoint the web widget
        // uses. pushNamed (not pushReplacement) so back returns to Home.
        _buildActionCard(
          icon: Icons.forum_outlined,
          title: "Ask Assistant",
          color: Colors.teal[600]!,
          onTap: () => Navigator.pushNamed(context, '/chat'),
        ),
      ],
    );
  }

  Widget _buildActionCard({
    required IconData icon,
    required String title,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: slateCardBorder),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.015), blurRadius: 10, offset: const Offset(0, 4)),
          ],
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: color.withValues(alpha: 0.1),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: primaryColor),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAnalyticsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          "REGIONAL MATRIX DASHBOARD",
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: textMutedColor, letterSpacing: 0.8),
        ),
        const SizedBox(height: 12),

        // FIX (audit #10): metric tiles now reflect the real /logs/summary
        // response instead of the hardcoded "1,248 kg" / "94.2%" literals.
        // total_detections and hotspot_zones are the two fields the audit
        // confirms the backend already returns; adjust here if the schema
        // differs once verified against the live route.
        Row(
          children: [
            Expanded(
              child: _buildMetricsGridTile(
                title: _analyticsLoading
                    ? "—"
                    : (_totalDetections?.toString() ?? "N/A"),
                label: "Total Detections",
                icon: Icons.delete_outline,
                trendColor: _trendChipColor(Colors.green),
                trendText: _trendChipLabel(),
                loading: _analyticsLoading,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _buildMetricsGridTile(
                title: _analyticsLoading
                    ? "—"
                    : (_hotspotZones?.toString() ?? "N/A"),
                label: "Hotspot Zones",
                icon: Icons.warning_amber_outlined,
                trendColor: _trendChipColor(primaryColor),
                trendText: _trendChipLabel(),
                loading: _analyticsLoading,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),

        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: slateCardBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    "Weekly Sightings Trend",
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: primaryColor),
                  ),
                  if (!_analyticsLoading && _weeklyTrends.isNotEmpty)
                    Text(
                      "TOTAL: ${_weeklyTrendTotal()} INCIDENTS",
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.blue[700]),
                    ),
                ],
              ),
              // Honest provenance: a cached payload isn't "live" — say so
              // on the surface, whether the device is offline or the
              // refresh simply failed.
              if (!_analyticsLoading && _fromCache)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    "Live data unavailable — showing cached data",
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.amber[800]),
                  ),
                ),
              const SizedBox(height: 24),

              if (_analyticsLoading)
                const SizedBox(
                  height: 108,
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2, color: primaryColor)),
                )
              else if (_weeklyTrends.isEmpty)
                const SizedBox(
                  height: 108,
                  child: Center(
                    child: Text(
                      "No detection data yet this week.",
                      style: TextStyle(fontSize: 12, color: textMutedColor),
                    ),
                  ),
                )
              else
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: _buildRealBars(),
                ),
            ],
          ),
        ),
      ],
    );
  }

  /// Normalizes each day's count against the week's max so bars scale 0..1.
  /// Labels are positional (index 0 = Monday ... 6 = Sunday) since the
  /// backend returns a flat count array in that fixed order, not labeled days.
  List<Widget> _buildRealBars() {
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final maxCount = _weeklyTrends.isEmpty
        ? 1
        : _weeklyTrends.reduce((a, b) => a > b ? a : b);
    final safeMax = maxCount == 0 ? 1 : maxCount;

    return List.generate(_weeklyTrends.length, (i) {
      final count = _weeklyTrends[i];
      final label = i < dayLabels.length ? dayLabels[i] : '';
      final fill = count / safeMax;
      final isHighlight = count == safeMax && safeMax > 0;
      return _buildSimulatedBar(label, fill.clamp(0.0, 1.0), isHighlight: isHighlight);
    });
  }

  int _weeklyTrendTotal() {
    return _weeklyTrends.fold<int>(0, (sum, count) => sum + count);
  }

  Widget _buildMetricsGridTile({
    required String title,
    required String label,
    required IconData icon,
    required Color trendColor,
    required String trendText,
    bool loading = false,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: slateCardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Icon(icon, color: primaryColor, size: 22),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: trendColor.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  trendText,
                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: trendColor),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            title,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: primaryColor, height: 1.1),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: textMutedColor),
          ),
        ],
      ),
    );
  }

  Widget _buildSimulatedBar(String label, double fillPercentage, {bool isHighlight = false}) {
    return Column(
      children: [
        Container(
          height: 100,
          width: 14,
          decoration: BoxDecoration(
            color: const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(8),
          ),
          // FIXED: Using Align to anchor the inner container to the bottom flawlessly
          child: Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              height: 100 * fillPercentage,
              decoration: BoxDecoration(
                color: isHighlight ? Colors.amber[600] : primaryColor.withValues(alpha: 0.85),
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: textDarkColor.withValues(alpha: 0.8)),
        ),
      ],
    );
  }
}