import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../config/app_config.dart';
import '../models/mobile_map_models.dart';
import '../services/api_client.dart';
import 'image_detail_dialog.dart';
import 'skeleton.dart';

/// Same green as the severity scale's Low / the web map's verified styling —
/// used here for the VERIFIED status chip.
const Color _verifiedGreen = Color(0xFF22c55e);

/// Detail view for a tapped community report pin: photo, AI bounding boxes
/// for verified+analyzed photos, VERIFIED chip, reporter, timestamp,
/// description. The model runs when an admin verifies the report, so the
/// boxes live on GET /reports/{id} (ReportDetailModal parity) — they are
/// fetched on open, not carried by the pin (the list payload stays light).
///
/// Box coordinates are absolute ORIGINAL-image pixels (report_inference_service
/// downloads the raw upload), so the photo is decoded at its native size and
/// the painter scales against it — same contract as [ImageDetailDialog]'s
/// legacy path.
class ReportDetailSheet extends StatefulWidget {
  final ReportPin pin;

  const ReportDetailSheet({super.key, required this.pin});

  @override
  State<ReportDetailSheet> createState() => _ReportDetailSheetState();
}

class _ReportDetailSheetState extends State<ReportDetailSheet> {
  /// Full-res citizen photos can hang on a flaky connection; budget the
  /// decode and flip to an error state instead of an infinite shimmer.
  static const _loadTimeout = Duration(seconds: 30);

  /// Detections from GET /reports/{id}: null until the fetch resolves,
  /// empty when analysis completed with no boxes (clean photo) or analysis
  /// is running/failed/pending. Pin taps only see verified reports, but the
  /// analysis state may still be anything.
  List<ImageDetection>? _detections;
  String? _analysisStatus;
  bool _analysisFailed = false;

  late final ImageStreamListener _imageListener;
  ImageStream? _imageStream;
  Timer? _timeoutTimer;
  int _naturalWidth = 0;
  int _naturalHeight = 0;
  bool _imageError = false;
  int _attempt = 0;

  /// The sheet must display the ORIGINAL photo (no Cloudinary resize): the
  /// boxes are in raw-pixel space, so the decoded native dims we scale
  /// against have to be the same image the coordinates were produced from —
  /// a downscaled variant would decode smaller dims and misplace every box.
  String get _displayUrl => widget.pin.photoUrl ?? '';

  @override
  void initState() {
    super.initState();
    _imageListener = ImageStreamListener(
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
        debugPrint('Report image load failed: $error');
        if (!mounted) return;
        setState(() => _imageError = true);
      },
    );
    _resolveImage();
    _loadAnalysis();
  }

  /// Cached decode can finish before the listener attaches; the stream
  /// pattern recovers dims exactly like ImageDetailDialog.
  void _resolveImage() {
    _imageStream?.removeListener(_imageListener);
    _timeoutTimer?.cancel();
    _naturalWidth = 0;
    _naturalHeight = 0;
    _imageError = false;
    if (_displayUrl.isEmpty) return;

    final provider = CachedNetworkImageProvider(_displayUrl);
    _imageStream = provider.resolve(const ImageConfiguration());
    _imageStream!.addListener(_imageListener);

    _timeoutTimer = Timer(_loadTimeout, () {
      if (mounted && _naturalWidth == 0 && !_imageError) {
        setState(() => _imageError = true);
      }
    });
  }

  void _retry() {
    CachedNetworkImageProvider(_displayUrl).evict().catchError((_) => false);
    setState(() => _attempt++);
    _resolveImage();
    _loadAnalysis();
  }

  /// Public detail read (routes/reports.py get_report): carries
  /// analysis_status + per-box detections for verified reports.
  Future<void> _loadAnalysis() async {
    if (widget.pin.photoUrl == null || widget.pin.photoUrl!.isEmpty) return;
    try {
      final res = await ApiClient.get(
        Uri.parse('${AppConfig.reportsBaseUrl}/${widget.pin.reportId}'),
      );
      final data = ApiClient.decodeJson(res) as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _analysisStatus = (data['analysis_status'] as String?) ?? 'pending';
        final boxes = data['detections'] as List<dynamic>? ?? [];
        _detections = boxes
            .map((b) => b as Map<String, dynamic>)
            .map((b) => ImageDetection(
                  label: (b['waste_type'] as String?) ?? 'waste',
                  confidence: (b['confidence_score'] as num?)?.toDouble() ?? 0,
                  box2d: [
                    (b['bbox_x1'] as num).toDouble(),
                    (b['bbox_y1'] as num).toDouble(),
                    (b['bbox_x2'] as num).toDouble(),
                    (b['bbox_y2'] as num).toDouble(),
                  ],
                ))
            .toList();
      });
    } catch (e) {
      debugPrint('Report analysis fetch failed: $e');
      if (!mounted) return;
      setState(() => _analysisFailed = true);
    }
  }

  @override
  void dispose() {
    _timeoutTimer?.cancel();
    _imageStream?.removeListener(_imageListener);
    super.dispose();
  }

  bool get _hasBoxes =>
      _analysisStatus == 'completed' &&
      (_detections?.isNotEmpty ?? false);

  /// 'completed' with ZERO boxes is a valid clean-photo result — never
  /// labeled 'unavailable' (same semantics as the web modal).
  bool get _showAnalysisNote =>
      _analysisFailed ||
      _analysisStatus == 'running' ||
      _analysisStatus == 'failed' ||
      _analysisStatus == 'pending';

  String get _analysisNoteText {
    if (_analysisStatus == 'running') return 'AI ANALYSIS RUNNING…';
    return 'AI ANALYSIS UNAVAILABLE';
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width > 600;
    final wasteLabel = widget.pin.wasteType.toUpperCase().replaceAll('_', ' ');

    return Dialog(
      backgroundColor: Colors.transparent,
      child: Container(
        constraints: BoxConstraints(maxWidth: wide ? 380 : double.infinity),
        // Double-bezel surface, same language as MapPanel/SectorPanel.
        decoration: BoxDecoration(
          color: ink.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
          boxShadow: surfaceShadow(alpha: 0.22),
        ),
        padding: const EdgeInsets.all(4),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.98),
            borderRadius: BorderRadius.circular(20),
          ),
          padding: const EdgeInsets.all(14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header: waste type + VERIFIED chip + close.
              Row(
                children: [
                  Expanded(
                    child: Text(
                      wasteLabel,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: ink,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: _verifiedGreen.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.verified_rounded, size: 12, color: _verifiedGreen),
                        SizedBox(width: 4),
                        Text(
                          'VERIFIED',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w900,
                            color: _verifiedGreen,
                            letterSpacing: 0.6,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _photoSection(),
              const SizedBox(height: 10),
              if ((widget.pin.description ?? '').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    widget.pin.description!,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.45,
                      color: Color(0xFF475569),
                    ),
                  ),
                ),
              Row(
                children: [
                  const Icon(Icons.person_outline_rounded, size: 12, color: inkMuted),
                  const SizedBox(width: 5),
                  Expanded(
                    child: Text(
                      widget.pin.reporterName,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: inkMuted,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (_formattedDate != null) ...[
                    const Icon(Icons.schedule_rounded, size: 12, color: inkMuted),
                    const SizedBox(width: 5),
                    Text(
                      _formattedDate!,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: inkMuted,
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: TextButton.styleFrom(
                    backgroundColor: primaryBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text(
                    'Close',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? get _formattedDate {
    final d = DateTime.tryParse(widget.pin.timestamp ?? '');
    if (d == null) return null;
    final mm = d.month.toString().padLeft(2, '0');
    final dd = d.day.toString().padLeft(2, '0');
    return '$dd/$mm/${d.year}';
  }

  /// Photo + AI boxes. Before the native dims resolve the area is a
  /// skeleton; once decoded, an AspectRatio box sized to the image makes the
  /// BoxFit.contain fill it edge-to-edge, so the painter's own scale math
  /// against the native dims maps 1:1 (same letterbox trick as
  /// ImageDetailDialog).
  Widget _photoSection() {
    if (_hasBoxes && _naturalWidth > 0 && _naturalHeight > 0) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: AspectRatio(
          aspectRatio: _naturalWidth / _naturalHeight,
          child: Stack(
            children: [
              KeyedSubtree(
                key: ValueKey('report-photo-$_attempt'),
                child: Image(
                  image: CachedNetworkImageProvider(_displayUrl),
                  fit: BoxFit.contain,
                ),
              ),
              Positioned.fill(
                child: CustomPaint(
                  painter: BoundingBoxPainter(
                    detections: _detections!,
                    naturalWidth: _naturalWidth,
                    naturalHeight: _naturalHeight,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    // No boxes (fetch failed / analysis not completed / clean photo): plain
    // thumbnail with shimmer, plus the honest analysis note when applicable.
    // Tap-to-retry in the error state — without it the retry text lies.
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: GestureDetector(
        onTap: _imageError ? _retry : null,
        child: SizedBox(
        width: double.infinity,
        height: 150,
        child: Stack(
          children: [
            Positioned.fill(
              child: _imageError
                  ? Container(
                      color: const Color(0xFFf1f5f9),
                      alignment: Alignment.center,
                      child: const Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.broken_image, color: Color(0xFFcbd5e1), size: 24),
                          SizedBox(height: 4),
                          Text(
                            'Couldn\'t load this image. Tap to retry.',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: inkFaint,
                            ),
                          ),
                        ],
                      ),
                    )
                  : _displayUrl.isEmpty
                      ? Container(
                          color: const Color(0xFFf1f5f9),
                          alignment: Alignment.center,
                          child: const Text(
                            'No photo attached',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: inkFaint,
                            ),
                          ),
                        )
                      : _naturalWidth == 0
                          ? const SkeletonBox(radius: BorderRadius.zero)
                          : Image(
                              image: CachedNetworkImageProvider(_displayUrl),
                              fit: BoxFit.cover,
                            ),
            ),
            if (_showAnalysisNote && !_imageError)
              Positioned(
                bottom: 8,
                left: 0,
                right: 0,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.65),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      _analysisNoteText,
                      style: const TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
      ),
    );
  }
}
