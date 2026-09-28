import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/app_config.dart';
import 'api_client.dart';

// ApiException now lives in api_client.dart and is re-exported here for
// backwards compatibility (login_screen.dart imports it from this file).
export 'api_client.dart' show ApiException;

class AuthService {
  String get baseUrl => AppConfig.authBaseUrl;

  final storage = const FlutterSecureStorage();

  Future<bool> register(String name, String email, String password) async {
    // Non-2xx -> ApiException (with the backend's detail message) via the
    // shared client; network errors propagate raw for the screen's generic
    // handler.
    final res = await ApiClient.post(
      Uri.parse('$baseUrl/register'),
      auth: false,
      body: {
        "name": name,
        "email": email,
        "password": password,
        "role": "community",
      },
    );
    ApiClient.decodeJson(res);
    return true;
  }

  Future<String?> login(String email, String password) async {
    // FIX (audit #17 follow-through): this used to throw plain Exception, so
    // login_screen.dart's `on ApiException` branch (401 -> bad credentials,
    // 5xx -> server error) never fired and every failure showed the generic
    // message. The shared client now throws ApiException with the real
    // status code, activating that branch.
    final res = await ApiClient.post(
      Uri.parse('$baseUrl/login'),
      auth: false,
      body: {"email": email, "password": password},
    );
    final data = ApiClient.decodeJson(res) as Map<String, dynamic>;

    final user = data["user"];

    final token = data["access_token"];
    final role = user["role"];
    final userId = user["user_id"];
    final name = user["name"];
    // FIX: fall back to the email the user typed in, since the login
    // response doesn't always echo it back on the user object.
    final userEmail = user["email"] ?? email;

    // A fresh, valid session: re-arm the 401 latch so a future expiry can
    // trigger the logout-redirect flow again.
    ApiClient.markSessionValid();

    await storage.write(key: "token", value: token);
    await storage.write(key: "role", value: role);
    await storage.write(key: "user_id", value: userId);
    // FIX: user_profile_screen.dart reads "user_name" / "user_email", but this
    // used to write "name" only (and never wrote email at all), so the profile
    // screen always fell back to the hardcoded placeholder after login.
    await storage.write(key: "user_name", value: name);
    await storage.write(key: "user_email", value: userEmail);

    return token;
  }

  Future<String?> getToken() async {
    return await storage.read(key: "token");
  }

  Future<void> logout() async {
    await storage.deleteAll();
  }

  // Password Reset
  Future<void> requestPasswordReset(String email) async {
    final res = await ApiClient.post(
      Uri.parse('$baseUrl/forgot-password'),
      auth: false,
      body: {"email": email},
    );
    ApiClient.decodeJson(res);
  }

  Future<void> resetPassword(
    String email,
    String code,
    String newPassword,
  ) async {
    final res = await ApiClient.post(
      Uri.parse('$baseUrl/reset-password'),
      auth: false,
      body: {
        "email": email,
        "code": code,
        "new_password": newPassword,
      },
    );
    ApiClient.decodeJson(res);
  }
}
