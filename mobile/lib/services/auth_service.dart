import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';



class AuthService {
  final String baseUrl = "https://shopper-agent-mustard.ngrok-free.dev/auth";

  final storage = const FlutterSecureStorage();

  Future<bool> register(String name, String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/register'),
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "ngrok-skip-browser-warning": "true",
        
      },
      body: jsonEncode({
        "name": name,
        "email": email,
        "password": password,
        "role": "community",
      }),
    );

    if (response.statusCode == 200) {
      return true;
    } else {
      final data = jsonDecode(response.body);
      throw Exception(data["detail"] ?? "Registration failed");
    }
  }

  Future<String?> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/login'),
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"email": email, "password": password}),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);

      final user = data["user"];

      final token = data["access_token"];
      final role = user["role"];
      final userId = user["user_id"];
      final name = user["name"];

      await storage.write(key: "token", value: token);
      await storage.write(key: "role", value: role);
      await storage.write(key: "user_id", value: userId);
      await storage.write(key: "name", value: name);

      return token;
    } else {
      final data = jsonDecode(response.body);
      throw Exception(data["detail"] ?? "Login failed");
    }
  }

  Future<String?> getToken() async {
    return await storage.read(key: "token");
  }

  Future<void> logout() async {
    await storage.deleteAll();
  }


  // Password Reset
  Future<void> requestPasswordReset(String email) async {
  final response = await http.post(
    Uri.parse('$baseUrl/forgot-password'),
    headers: {"Content-Type": "application/json"},
    body: jsonEncode({"email": email}),
  );

  if (response.statusCode != 200) {
    final data = jsonDecode(response.body);
    throw Exception(data["detail"] ?? "Failed to send reset code");
  }
}

Future<void> resetPassword(String email, String code, String newPassword) async {
  final response = await http.post(
    Uri.parse('$baseUrl/reset-password'),
    headers: {"Content-Type": "application/json"},
    body: jsonEncode({
      "email": email,
      "code": code,
      "new_password": newPassword,
    }),
  );

  if (response.statusCode != 200) {
    final data = jsonDecode(response.body);
    throw Exception(data["detail"] ?? "Invalid code or expired");
  }
}


}
