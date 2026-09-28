import 'package:TrashVision/services/api_client.dart';
import 'package:TrashVision/services/sync_services.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
// FIX (audit #18 - "No token expiry handling"): the app used to only check
// whether a token was *present*, never whether it had expired. An expired
// token was then attached to every API call by api_service.dart, silently
// failing with 401s instead of returning the user to login.
import 'package:jwt_decoder/jwt_decoder.dart';

import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'screens/report_screen.dart';
import 'screens/mapview.dart';
import 'screens/user_profile_screen.dart';

void main() async {

  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: '.env');
  const storage = FlutterSecureStorage();
  final token = await storage.read(key: "token");

  // FIX (audit #18): validate expiry, not just presence.
  bool isLoggedIn = false;
  bool sessionExpired = false;
  if (token != null) {
    bool expired;
    try {
      expired = JwtDecoder.isExpired(token);
    } catch (_) {
      // Malformed/undecodable token — treat the same as expired.
      expired = true;
    }
    if (expired) {
      sessionExpired = true;
      await storage.deleteAll();
    } else {
      isLoggedIn = true;
    }
  }

  runApp(MyApp(isLoggedIn: isLoggedIn, sessionExpired: sessionExpired));
}

class MyApp extends StatefulWidget {
  final bool isLoggedIn;
  final bool sessionExpired;
  const MyApp({super.key, required this.isLoggedIn, this.sessionExpired = false});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  // FIX (audit #18): shows the "session expired" message via a global
  // ScaffoldMessenger key rather than passing a flag into LoginScreen, so
  // LoginScreen itself doesn't need to change.
  final GlobalKey<ScaffoldMessengerState> _scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();
  // Global navigator for the ApiClient 401 hook: mid-session expiry can
  // happen on any screen (map, report, profile) and none of them own the
  // navigator, so the redirect must live here at the app root.
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();

  @override
void initState() {
  super.initState();

  // FIX: mid-session token expiry used to be silent — only app *startup*
  // checked expiry (main's JwtDecoder check), so an expired token attached
  // to every call afterwards failed with 401s that screens swallowed as
  // empty data. The shared client now reports 401s from authenticated
  // requests; install the handler exactly once at the root.
  // Give SyncService access to the global messenger so outbox results can
  // surface a summary snackbar from anywhere (Step 3).
  SyncService.messengerKey = _scaffoldMessengerKey;

  ApiClient.onUnauthorized = () async {
    // The stored token is dead — remove it so no further authenticated call
    // sends it and SyncService skips the outbox loop while logged out.
    const storage = FlutterSecureStorage();
    try {
      await storage.delete(key: 'token');
    } catch (_) {
      // Storage failure shouldn't block the redirect; the latch in
      // ApiClient keeps this handler from re-firing anyway.
    }
    final navigator = _navigatorKey.currentState;
    if (navigator == null || !navigator.mounted) return;
    navigator.pushNamedAndRemoveUntil('/login', (route) => false);
    _scaffoldMessengerKey.currentState?.showSnackBar(
      const SnackBar(content: Text("Your session expired. Please sign in again.")),
    );
  };

  SyncService().syncOutbox();
  Connectivity().onConnectivityChanged.listen((List<ConnectivityResult> results) {
    if (results.isNotEmpty && !results.contains(ConnectivityResult.none)) {
      debugPrint("Connection restored: Triggering Sync...");
      SyncService().syncOutbox();
    }
  });

  if (widget.sessionExpired) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scaffoldMessengerKey.currentState?.showSnackBar(
        const SnackBar(content: Text("Your session expired. Please sign in again.")),
      );
    });
  }
}

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TrashVision',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navigatorKey,
      scaffoldMessengerKey: _scaffoldMessengerKey,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
        useMaterial3: true,
      ),
      initialRoute: widget.isLoggedIn ? '/home' : '/login',
      routes: {
        '/login': (context) => const LoginScreen(),
        '/home': (context) => const HomeScreen(),
        '/map': (context) => const MapView(),
        '/report': (context) => const ReportScreen(),
        '/profile': (context) => const UserProfileScreen(),
      },
    );
  }
}