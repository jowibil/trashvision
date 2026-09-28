import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart'; // already a dependency (used in report_screen.dart)
// NOTE: not yet in pubspec.yaml — run `flutter pub add flutter_image_compress`
// FIX (audit #16 - "Camera captures high-res, no compression"): raw captures
// at ResolutionPreset.high were routinely 8-12MB, which on a spotty mobile
// connection meant slow, failure-prone uploads through api_service.dart's
// multipart request.
import 'package:flutter_image_compress/flutter_image_compress.dart';

class CameraPage extends StatefulWidget {
  final CameraDescription camera;
  const CameraPage({super.key, required this.camera});

  @override
  State<CameraPage> createState() => _CameraPageState();
}

class _CameraPageState extends State<CameraPage> {
  late CameraController _controller;
  late Future<void> _initFuture;
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    _controller = CameraController(
      widget.camera,
      ResolutionPreset.high,
    );
    _initFuture = _controller.initialize();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _takePicture() async {
    if (_isProcessing) return;
    setState(() => _isProcessing = true);
    try {
      await _initFuture;
      final image = await _controller.takePicture();

      // FIX (audit #16): compress to a bounded JPEG before handing the path
      // back to ReportScreen. Falls back to the original path if compression
      // fails for any reason, so a report is never blocked on this step.
      final compressedPath = await _compressImage(image.path);

      if (!mounted) return;
      Navigator.pop(context, compressedPath ?? image.path);
    } catch (e) {
      debugPrint("Camera capture error: $e");
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<String?> _compressImage(String originalPath) async {
    try {
      final dir = await getTemporaryDirectory();
      final targetPath =
          '${dir.path}/tv_${DateTime.now().millisecondsSinceEpoch}.jpg';

      final result = await FlutterImageCompress.compressAndGetFile(
        originalPath,
        targetPath,
        quality: 70,
        minWidth: 1920,
        minHeight: 1920,
        format: CompressFormat.jpeg,
      );

      if (result == null) return null;

      final originalSize = await File(originalPath).length();
      final compressedSize = await File(result.path).length();
      debugPrint(
          "Photo compressed: ${(originalSize / 1024).round()}KB -> ${(compressedSize / 1024).round()}KB");

      return result.path;
    } catch (e) {
      debugPrint("Image compression error (falling back to original): $e");
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: FutureBuilder<void>(
        future: _initFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.done) {
            return Stack(
              children: [
                CameraPreview(_controller),
                Positioned(
                  bottom: 40,
                  left: 0,
                  right: 0,
                  child: Center(
                    child: GestureDetector(
                      onTap: _takePicture,
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Colors.white70,
                            width: 4,
                          ),
                        ),
                        child: _isProcessing
                            ? const Padding(
                                padding: EdgeInsets.all(20),
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : null,
                      ),
                    ),
                  ),
                ),
                Positioned(
                  top: 50,
                  left: 16,
                  child: IconButton(
                    icon: const Icon(
                      Icons.arrow_back,
                      color: Colors.white,
                    ),
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
              ],
            );
          } else {
            return const Center(
              child: CircularProgressIndicator(color: Colors.white),
            );
          }
        },
      ),
    );
  }
}