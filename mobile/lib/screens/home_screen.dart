import 'package:TrashVision/widgets/bottom_nav.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
// import 'report_screen.dart';
import '../helper/gps_helper.dart';
import '../services/api_service.dart';

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

  /// FIX (audit #10): replaces the hardcoded dashboard numbers with a real
  /// fetch. Response shape confirmed against backend/routes/logs.py's
  /// get_dashboard_summary(): total_detections (int), weekly_trends
  /// (flat list of 7 ints, Mon to Sun), hotspot_zones (list of
  /// {id, name, date, severity} maps).
  Future<void> _loadAnalytics() async {
    if (mounted) setState(() => _analyticsLoading = true);
    try {
      final summary = await ApiService().getLogsSummary();
      if (summary == null) {
        if (mounted) setState(() => _analyticsLoading = false);
        return;
      }

      // FIX: previously expected weekly_trends as [{day/label, count/value}]
      // and discarded every entry since the backend actually returns a flat
      // list of ints (one count per weekday) — the chart silently stayed
      // empty even with real data.
      final rawTrends = summary['weekly_trends'];
      final trends = <int>[];
      if (rawTrends is List) {
        for (final entry in rawTrends) {
          trends.add(entry is num ? entry.round() : 0);
        }
      }

      final rawHotspots = summary['hotspot_zones'];
      final hotspotCount = rawHotspots is List ? rawHotspots.length : null;

      if (mounted) {
        setState(() {
          _totalDetections = summary['total_detections'] is int ? summary['total_detections'] as int : null;
          _hotspotZones = hotspotCount;
          _weeklyTrends = trends;
          _analyticsLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Analytics load error: $e");
      if (mounted) setState(() => _analyticsLoading = false);
    }
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
                trendColor: Colors.green,
                trendText: _analyticsLoading ? "..." : "Live",
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
                trendColor: primaryColor,
                trendText: _analyticsLoading ? "..." : "Live",
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