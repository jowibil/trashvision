import 'dart:async';
import 'package:flutter/material.dart';
import 'package:TrashVision/services/auth_service.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  // Controllers
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final AuthService _authService = AuthService();

  // State
  bool _isLoading = false;
  bool _codeSent = false;
  int _resendCountdown = 0;
  Timer? _timer;

  // Theme
  final Color brandBlue = const Color(0xFF005D90);
  final Color successGreen = const Color(0xFF2E7D32);

  @override
  void dispose() {
    _timer?.cancel();
    _emailController.dispose();
    _codeController.dispose();
    _newPasswordController.dispose();
    super.dispose();
  }

  // Helper: Start Resend Timer
  void _startTimer() {
    setState(() => _resendCountdown = 60);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_resendCountdown == 0) {
        timer.cancel();
      } else {
        setState(() => _resendCountdown--);
      }
    });
  }

  // Helper: Show Formatted Error
  void _showStatus(String message, {bool isError = true}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.redAccent : successGreen,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.all(16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  // Logic: Request Code
  void _handleRequestCode() async {
    final email = _emailController.text.trim();

    if (email.isEmpty) {
      _showStatus("Please enter your email.");
      return;
    }

    // ✅ Fixed with 'r' prefix for Raw String
    final bool isValidEmail = RegExp(
      r'^[^@]+@[^@]+\.[^@]+$',
    ).hasMatch(email);

    if (!isValidEmail) {
      _showStatus("Please enter a valid email format.");
      return;
    }

    setState(() => _isLoading = true);
    try {
      await _authService.requestPasswordReset(email);
      if (!mounted) return;

      setState(() => _codeSent = true);
      _startTimer();
      _showStatus("Verification code sent!", isError: false);
    } catch (e) {
      if (!mounted) return;
      _showStatus(e.toString().replaceAll("Exception: ", ""));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // Logic: Verify & Update
  void _handleReset() async {
    final code = _codeController.text.trim();
    final newPass = _newPasswordController.text;

    if (code.length < 6) {
      _showStatus("Enter the 6-digit code.");
      return;
    }
    if (newPass.length < 8) {
      _showStatus("Password must be at least 8 characters.");
      return;
    }

    setState(() => _isLoading = true);
    try {
      await _authService.resetPassword(
        _emailController.text.trim(),
        code,
        newPass,
      );
      if (!mounted) return;

      _showStatus("Password updated! Please login.", isError: false);
      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      _showStatus(e.toString().replaceAll("Exception: ", ""));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new, color: brandBlue, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 32.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 20),
              Text(
                _codeSent ? "Verify Code" : "Forgot Password",
                style: TextStyle(
                  color: brandBlue,
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                _codeSent
                    ? "Enter the 6-digit code and your new password."
                    : "Enter your email address to receive a 6-digit reset code.",
                style: TextStyle(
                  color: Colors.grey[600],
                  fontSize: 16,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 40),

              _buildLabel("Email Address"),
              TextField(
                controller: _emailController,
                enabled: !_codeSent,
                keyboardType: TextInputType.emailAddress,
                decoration: _inputStyle(Icons.email_outlined),
              ),

              if (_codeSent) ...[
                const SizedBox(height: 24),
                _buildLabel("6-Digit Code"),
                TextField(
                  controller: _codeController,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: _inputStyle(Icons.lock_clock_outlined),
                ),
                const SizedBox(height: 8),
                _buildLabel("New Password"),
                TextField(
                  controller: _newPasswordController,
                  obscureText: true,
                  decoration: _inputStyle(Icons.lock_outline),
                ),
                const SizedBox(height: 16),
                Center(
                  child: TextButton(
                    onPressed: _resendCountdown == 0
                        ? _handleRequestCode
                        : null,
                    child: Text(
                      _resendCountdown > 0
                          ? "Resend code in ${_resendCountdown}s"
                          : "Resend Code",
                      style: TextStyle(
                        color: _resendCountdown > 0 ? Colors.grey : brandBlue,
                      ),
                    ),
                  ),
                ),
              ],

              const SizedBox(height: 32),

              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _isLoading
                      ? null
                      : (_codeSent ? _handleReset : _handleRequestCode),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: brandBlue,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          height: 24,
                          width: 24,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : Text(
                          _codeSent ? "Update Password" : "Send Reset Code",
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                ),
              ),

              if (_codeSent)
                Center(
                  child: TextButton(
                    onPressed: () => setState(() {
                      _codeSent = false;
                      _timer?.cancel();
                      _resendCountdown = 0;
                    }),
                    child: Text(
                      "Try a different email",
                      style: TextStyle(color: brandBlue.withOpacity(0.7)),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLabel(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0, left: 4.0),
      child: Text(
        label,
        style: const TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 14,
          color: Colors.black87,
        ),
      ),
    );
  }

  InputDecoration _inputStyle(IconData icon) {
    return InputDecoration(
      prefixIcon: Icon(icon, color: brandBlue, size: 22),
      filled: true,
      fillColor: Colors.grey[50],
      counterText: "", // Hides the maxLength counter
      contentPadding: const EdgeInsets.symmetric(vertical: 16),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.grey[200]!),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: brandBlue, width: 2),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.grey[100]!),
      ),
    );
  }
}
