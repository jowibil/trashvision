import 'dart:async';
import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../helper/cloudinary_helper.dart';
import '../models/mobile_map_models.dart';

/// Paints detection bounding boxes over a drone frame. `box2d` holds absolute
/// original-image pixel coordinates, scaled here against the decoded image's
/// natural dimensions.
class BoundingBoxPainter extends CustomPainter {
  final List<ImageDetection> detections;
  final int naturalWidth;
  final int naturalHeight;

  BoundingBoxPainter({
    required this.detections,
    required this.naturalWidth,
    required this.naturalHeight,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (naturalWidth == 0 || naturalHeight == 0) return;

    // Scale aspect logic identically aligned with your web scaling matrix
    final double scaleX = size.width / naturalWidth;
    final double scaleY = size.height / naturalHeight;

    for (var det in detections) {
      if (det.box2d.length < 4) continue;

      final double x1 = det.box2d[0];
      final double y1 = det.box2d[1];
      final double x2 = det.box2d[2];
      final double y2 = det.box2d[3];

      final rect = Rect.fromLTRB(
        x1 * scaleX,
        y1 * scaleY,
        x2 * scaleX,
        y2 * scaleY,
      );

      // Draw outer box border
      final paint = Paint()
        ..color = const Color(0xFFEF4444)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0;
      canvas.drawRect(rect, paint);

      // Draw inner target shaded layout tint region
      final fillPaint = Paint()
        ..color = const Color(0xFFEF4444).withValues(alpha: 0.1)
        ..style = PaintingStyle.fill;
      canvas.drawRect(rect, fillPaint);

      // Build target floating text layout overlay label strings
      final textPainter = TextPainter(
        text: TextSpan(
          text: '${det.label.toUpperCase().replaceAll('_', ' ')} ${(det.confidence * 100).toStringAsFixed(0)}%',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 8,
            fontWeight: FontWeight.bold,
            backgroundColor: Color(0xFFEF4444),
          ),
        ),
        textDirection: TextDirection.ltr,
      );

      textPainter.layout();
      textPainter.paint(
        canvas,
        Offset(rect.left, rect.top - 12 >= 0 ? rect.top - 12 : rect.top),
      );
    }
  }

  @override
  bool shouldRepaint(covariant BoundingBoxPainter oldDelegate) =>
      oldDelegate.detections != detections ||
      oldDelegate.naturalWidth != naturalWidth ||
      oldDelegate.naturalHeight != naturalHeight;
}

/// FIX (audit #13): extracted from the old inline StatefulBuilder so the
/// ImageStream listener is added exactly once (initState) and always
/// removed (dispose), instead of being re-added on every rebuild and never
/// cleaned up.
class ImageDetailDialog extends StatefulWidget {
  final DroneImage img;
  const ImageDetailDialog({super.key, required this.img});

  @override
  State<ImageDetailDialog> createState() => _ImageDetailDialogState();
}

class _ImageDetailDialogState extends State<ImageDetailDialog> {
  /// FIX (Step 5): full-res drone frames on a flaky mobile connection can
  /// hang indefinitely; without a budget the dialog spins forever.
  static const _loadTimeout = Duration(seconds: 30);

  late final ImageStreamListener _listener;
  ImageStream? _stream;
  Image? _networkImage;
  int _naturalWidth = 0;
  int _naturalHeight = 0;
  bool _hasError = false;
  Timer? _timeoutTimer;
  int _attempt = 0;

  /// True when the backend supplied the original-frame dimensions — the
  /// fast path: load a downscaled variant (cheap bytes + decode) and scale
  /// boxes against the DB dimensions instead of the decoded size.
  bool get _hasDbDimensions =>
      (widget.img.imageWidth ?? 0) > 0 && (widget.img.imageHeight ?? 0) > 0;

  String get _displayUrl => _hasDbDimensions
      ? cloudinaryTransformUrl(widget.img.fileUrl, kCloudinaryDetailLarge)
      : widget.img.fileUrl;

  @override
  void initState() {
    super.initState();
    // FIX (Step 5): the listener previously only handled onImage — a 404,
    // expired URL, or dropped connection left _naturalWidth at 0 and the
    // user staring at an infinite spinner. onError + the timer now flip the
    // dialog into a retryable error state.
    _listener = ImageStreamListener(
      (ImageInfo info, bool _) {
        _timeoutTimer?.cancel();
        if (!mounted) return;
        setState(() {
          _naturalWidth = info.image.width;
          _naturalHeight = info.image.height;
        });
      },
      onError: (Object error, StackTrace? stackTrace) {
        _timeoutTimer?.cancel();
        debugPrint('Image load failed for ${widget.img.fileUrl}: $error');
        if (!mounted) return;
        setState(() => _hasError = true);
      },
    );
    _resolveImage();
  }

  /// Two paths:
  ///  - DB dimensions known (new rows): load the Cloudinary-downscaled
  ///    variant. box2d stays in original-pixel space; BoundingBoxPainter is
  ///    given the DB dimensions explicitly, so the downscaled decode can't
  ///    misplace boxes. No full-res decode — the OOM guard this enables.
  ///  - Legacy rows (dimensions null): decode the full original and derive
  ///    dimensions from it, as before. Correct, just memory-heavy.
  void _resolveImage() {
    _stream?.removeListener(_listener);
    _timeoutTimer?.cancel();
    _naturalWidth = 0;
    _naturalHeight = 0;
    _hasError = false;
    _networkImage = Image.network(_displayUrl, fit: BoxFit.contain);
    _stream = _networkImage!.image.resolve(const ImageConfiguration());
    _stream!.addListener(_listener);

    _timeoutTimer = Timer(_loadTimeout, () {
      if (mounted && _naturalWidth == 0 && !_hasError) {
        setState(() => _hasError = true);
      }
    });
  }

  void _retry() {
    // Evict the failed entry from the image cache — otherwise Image.network
    // resolves the same cached error/stream and the retry is a no-op.
    final provider = _networkImage?.image;
    if (provider != null) {
      provider.evict().catchError((_) => false);
    }
    setState(() => _attempt++); // new key remounts the Image widget
    _resolveImage();
  }

  /// What box2d coordinates are expressed against: the backend-supplied
  /// original dimensions when available, otherwise the decoded image's
  /// dimensions (legacy path — identical to pre-pipeline behavior).
  int get _referenceWidth =>
      _hasDbDimensions ? widget.img.imageWidth! : _naturalWidth;
  int get _referenceHeight =>
      _hasDbDimensions ? widget.img.imageHeight! : _naturalHeight;

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    _stream?.removeListener(_listener);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF0F172A),
      contentPadding: EdgeInsets.zero,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppBar(
            backgroundColor: Colors.transparent,
            elevation: 0,
            title: Text(
              '${widget.img.detections.length} Detection(s) Found',
              style: const TextStyle(fontSize: 14, color: Colors.white, fontWeight: FontWeight.bold),
            ),
            leading: IconButton(
              icon: const Icon(Icons.close, color: Colors.white),
              onPressed: () => Navigator.pop(context),
            ),
          ),
          Flexible(
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(16)),
              child: _hasError
                  ? SizedBox(
                      height: 250,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.cloud_off, color: Colors.white38, size: 40),
                          const SizedBox(height: 12),
                          const Text(
                            "Couldn't load this image.",
                            style: TextStyle(color: Colors.white70, fontSize: 13),
                          ),
                          const SizedBox(height: 16),
                          OutlinedButton.icon(
                            onPressed: _retry,
                            icon: const Icon(Icons.refresh, size: 16),
                            label: const Text('Retry'),
                            style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
                          ),
                        ],
                      ),
                    )
                  : _naturalWidth == 0
                      ? const SizedBox(
                          height: 250,
                          child: Center(child: CircularProgressIndicator(color: primaryBlue)),
                        )
                      : AspectRatio(
                          // Scale reference: DB dimensions when known (box2d
                          // is in original-pixel space), else the decoded
                          // image's own dimensions (legacy path).
                          aspectRatio: _referenceWidth / _referenceHeight,
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              // Keyed by attempt so a retry remounts the
                              // Image (fresh decode) instead of reusing the
                              // failed one.
                              KeyedSubtree(
                                key: ValueKey('img-$_attempt'),
                                child: _networkImage!,
                              ),
                              Positioned.fill(
                                child: CustomPaint(
                                  painter: BoundingBoxPainter(
                                    detections: widget.img.detections,
                                    naturalWidth: _referenceWidth,
                                    naturalHeight: _referenceHeight,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
            ),
          ),
        ],
      ),
    );
  }
}
