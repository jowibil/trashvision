import 'package:TrashVision/services/sync_services.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/report_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  const storage = FlutterSecureStorage();
  final token = await storage.read(key: "token");

  runApp(MyApp(isLoggedIn: token != null));
}

class MyApp extends StatefulWidget {
  final bool isLoggedIn;
  const MyApp({super.key, required this.isLoggedIn});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  @override
void initState() {
  super.initState();
  
  SyncService().syncOutbox();
  Connectivity().onConnectivityChanged.listen((List<ConnectivityResult> results) {
    if (results.isNotEmpty && !results.contains(ConnectivityResult.none)) {
      print("Connection restored: Triggering Sync...");
      SyncService().syncOutbox();
    }
  });
}

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TrashVision',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
        useMaterial3: true,
      ),
      initialRoute: widget.isLoggedIn ? '/home' : '/login',
      routes: {
        '/login': (context) => const LoginScreen(),
        '/home': (context) => const HomeScreen(),
        '/map': (context) => const Scaffold(
          body: Center(child: Text("Map Feature Coming Soon")),
        ),
        '/report': (context) => const ReportScreen(),
        '/profile': (context) => const Scaffold(
          body: Center(child: Text("Profile Feature Coming Soon")),
        ),
      },
    );
  }
}
