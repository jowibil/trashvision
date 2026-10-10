import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../helper/cloudinary_helper.dart';
import '../models/mobile_map_models.dart';
import 'skeleton.dart';

/// Same green as the severity scale's Low / the web map's verified styling —
/// used here for the VERIFIED status chip.
const Color _verifiedGreen = Color(0xFF22c55e);

/// Detail view for a tapped community report pin: thumbnail (Cloudinary
/// transform + shimmer placeholder), waste-type badge, VERIFIED chip,
/// reporter, timestamp, description. Reports carry no bounding boxes, so
/// this is intentionally simpler than [ImageDetailDialog].
class ReportDetailSheet extends StatelessWidget {
  final ReportPin pin;

  const ReportDetailSheet({super.key, required this.pin});

  String? get _displayUrl =>
      pin.photoUrl == null ? null : cloudinaryTransformUrl(pin.photoUrl!, kCloudinaryThumbMedium);

  String? get _formattedDate {
    final d = DateTime.tryParse(pin.timestamp ?? '');
    if (d == null) return null;
    final mm = d.month.toString().padLeft(2, '0');
    final dd = d.day.toString().padLeft(2, '0');
    return '$dd/$mm/${d.year}';
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width > 600;
    final wasteLabel = pin.wasteType.toUpperCase().replaceAll('_', ' ');

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
              _thumbnail(),
              const SizedBox(height: 10),
              if ((pin.description ?? '').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    pin.description!,
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
                      pin.reporterName,
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

  Widget _thumbnail() {
    final url = _displayUrl;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: double.infinity,
        height: 150,
        child: url == null
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
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                memCacheWidth: 320,
                maxWidthDiskCache: 640,
                placeholder: (context, url) => const SkeletonBox(radius: BorderRadius.zero),
                errorWidget: (context, url, error) => Container(
                  color: const Color(0xFFf1f5f9),
                  alignment: Alignment.center,
                  child: const Icon(Icons.broken_image, color: Color(0xFFcbd5e1), size: 24),
                ),
              ),
      ),
    );
  }
}
