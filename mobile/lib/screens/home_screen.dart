import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../widgets/bottom_nav.dart';
import 'package:image_picker/image_picker.dart';
import 'report_screen.dart';

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
  int currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _loadUserData();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkForLostCameraData();
    });
  }

  Future<void> _checkForLostCameraData() async {
    final LostDataResponse response = await _picker.retrieveLostData();
    if (response.isEmpty) return;

    if (response.file != null) {
      if (!mounted) return;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ReportScreen(initialImagePath: response.file!.path),
        ),
      );
    }
  }

  Future<void> _loadUserData() async {
    final storedName = await storage.read(key: "name");
    final storedRole = await storage.read(key: "role");

    setState(() {
      name = storedName;
      role = storedRole;
    });
  }

  void handleLogout() async {
    await storage.deleteAll();
    if (!mounted) return;

    Navigator.pushReplacementNamed(context, '/login');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,

      appBar: AppBar(
        backgroundColor: const Color(0xFF005D90),
        elevation: 0,
        title: const Text(
          "TrashVision",
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: Colors.white,
            letterSpacing: 0.5,
          ),
        ),
        actions: [
          IconButton(
            onPressed: handleLogout,
            icon: const Icon(Icons.logout, color: Colors.white),
          ),
        ],
      ),

      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 10),

            Text(
              "Welcome back,",
              style: TextStyle(fontSize: 16, color: Colors.grey[600]),
            ),

            Text(
              name ?? "User",
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
                color: Color(0xFF005D90),
              ),
            ),

            const SizedBox(height: 6),

            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFF005D90).withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                (role ?? "community").toUpperCase(),
                style: const TextStyle(
                  color: Color(0xFF005D90),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),

            const SizedBox(height: 30),

            _buildCard(
              icon: Icons.report_problem,
              title: "Submit Waste Report",
              subtitle: "Report trash sightings in your area",
              onTap: () {
                Navigator.pushNamed(context, '/report');
              },
            ),

            const SizedBox(height: 15),

            _buildCard(
              icon: Icons.map,
              title: "Waste Map",
              subtitle: "View nearby waste hotspots",
              onTap: () {
                Navigator.pushNamed(context, '/map');
              },
            ),
          ],
        ),
      ),

      bottomNavigationBar: const BottomNavBar(currentIndex: 0),
    );
  }

  Widget _buildCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.grey.shade200),
          boxShadow: [
            BoxShadow(
              color: Colors.grey.withOpacity(0.1),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFF005D90).withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: const Color(0xFF005D90)),
            ),
            const SizedBox(width: 15),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios, size: 16),
          ],
        ),
      ),
    );
  }
}
