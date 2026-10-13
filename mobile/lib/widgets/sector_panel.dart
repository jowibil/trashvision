import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../helper/cloudinary_helper.dart';
import '../models/mobile_map_models.dart';
import 'skeleton.dart';

/// Wide-screen threshold: side panel at/above, bottom sheet below.
const double kSectorPanelWideBreakpoint = 600;

/// The sector drawer's content, shared between both adaptive layouts.
/// Double-bezel surface (tray shell + inner core), severity-synced header
/// badge, paged thumbnail rail, retryable error row, and load-more tile.
class SectorPanel extends StatelessWidget {
  final HexBin hex;
  final bool wide;
  final bool loading;
  final bool drawerError;
  final List<DroneImage> drawerImages;
  final int pendingCount;
  final bool loadingMore;

  /// Null in sheet mode (the grab handle + map tap close the sheet).
  final VoidCallback? onClose;
  final VoidCallback onRetry;
  final VoidCallback onLoadMore;
  final ValueChanged<DroneImage> onImageTap;

  /// DraggableScrollableSheet mode: full-width vertical layout whose list
  /// scrolls on the sheet's controller (dragging the list moves the sheet).
  final bool sheet;
  final ScrollController? scrollController;

  const SectorPanel({
    super.key,
    required this.hex,
    required this.wide,
    required this.loading,
    required this.drawerError,
    required this.drawerImages,
    required this.pendingCount,
    required this.loadingMore,
    required this.onClose,
    required this.onRetry,
    required this.onLoadMore,
    required this.onImageTap,
    this.sheet = false,
    this.scrollController,
  });

  /// DraggableScrollableSheet variant for narrow screens. Reuses the wide
  /// (vertical) tile layout at full width; the sheet's controller drives the
  /// list so drag-to-expand / drag-to-dismiss work from the content itself.
  static Widget sheetContent({
    required HexBin hex,
    required bool loading,
    required bool drawerError,
    required List<DroneImage> drawerImages,
    required int pendingCount,
    required bool loadingMore,
    required VoidCallback onRetry,
    required VoidCallback onLoadMore,
    required ValueChanged<DroneImage> onImageTap,
    required ScrollController scrollController,
  }) =>
      SectorPanel(
        hex: hex,
        wide: true,
        loading: loading,
        drawerError: drawerError,
        drawerImages: drawerImages,
        pendingCount: pendingCount,
        loadingMore: loadingMore,
        onClose: null,
        onRetry: onRetry,
        onLoadMore: onLoadMore,
        onImageTap: onImageTap,
        sheet: true,
        scrollController: scrollController,
      );

  /// CCI-based severity (size-invariant, web-parity) — raw counts stop
  /// meaning the same thing now that cell sizes are adaptive per area.
  Color get _severityColor => getCciColor(hex.cci);

  @override
  Widget build(BuildContext context) {
    final wide = this.wide;
    final borderRadius = sheet
        ? const BorderRadius.vertical(top: Radius.circular(24))
        : wide
            ? const BorderRadius.horizontal(left: Radius.circular(24))
            : const BorderRadius.vertical(top: Radius.circular(24));

    return Container(
      // Sheet: full width (the sheet wrapper owns outer chrome + margins).
      width: wide && !sheet ? 320 : double.infinity,
      height: wide && !sheet ? double.infinity : null,
      constraints:
          wide && !sheet ? null : (sheet ? null : const BoxConstraints(maxHeight: 280)),
      // Double-bezel: outer tray shell...
      decoration: BoxDecoration(
        color: ink.withValues(alpha: 0.06),
        borderRadius: borderRadius,
        border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
        boxShadow: surfaceShadow(alpha: 0.22),
      ),
      padding: const EdgeInsets.all(4),
      child: Container(
        // ...inner core with concentric radius.
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.98),
          borderRadius: const BorderRadius.all(Radius.circular(20)),
        ),
        child: Column(
          mainAxisSize: wide ? MainAxisSize.max : MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _header(),
            const Hairline(),
            Expanded(child: _content(context)),
          ],
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 2),
      child: Row(
        children: [
          // Severity badge — same scale as the map legend + hex fills.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: _severityColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: _severityColor,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: _severityColor.withValues(alpha: 0.4),
                        blurRadius: 5,
                        spreadRadius: -1,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '${getCciLabel(hex.cci)}  ·  ${hex.count} detection${hex.count != 1 ? 's' : ''}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: _severityColor,
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
          // Close: circular button-in-button affordance (omitted in sheet
          // mode — the grab handle and a map tap dismiss it).
          if (onClose != null)
          GestureDetector(
            onTap: onClose,
            child: Container(
              width: 30,
              height: 30,
              decoration: BoxDecoration(
                color: ink.withValues(alpha: 0.05),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.close_rounded, size: 16, color: inkMuted),
            ),
          ),
        ],
      ),
    );
  }

  Widget _content(BuildContext context) {
    if (loading) {
      // Shimmer placeholders shaped like the real tile rail — reads as
      // "content is coming" instead of a stalled spinner.
      return _skeletonRail(context, wide);
    }

    if (drawerError) {
      // A failed fetch is not an empty sector — retryable error row.
      return GestureDetector(
        onTap: onRetry,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: const [
              Icon(Icons.cloud_off_rounded, size: 22, color: Color(0xFFb91c1c)),
              SizedBox(height: 8),
              Text(
                "Couldn't load detections. Tap to retry.",
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFFb91c1c),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (drawerImages.isEmpty) {
      return const Center(
        child: Text(
          'No detections in this sector.',
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    return ListView.builder(
      // Vertical rail on the wide side panel + sheet, horizontal strip on
      // the narrow fixed panel. In sheet mode the controller is the sheet's:
      // scrolling the list is what drags the sheet between snap points.
      controller: scrollController,
      scrollDirection: wide ? Axis.vertical : Axis.horizontal,
      padding: EdgeInsets.fromLTRB(
        14,
        4,
        14,
        sheet ? MediaQuery.paddingOf(context).bottom + 12 : 12,
      ),
      itemCount: drawerImages.length + (pendingCount > 0 ? 1 : 0),
      itemBuilder: (context, index) {
        // Trailing tile fetches the next page.
        if (index == drawerImages.length) {
          return _loadMoreTile();
        }
        return _thumbnailTile(drawerImages[index]);
      },
    );
  }

  /// Shimmer rail mirroring the real thumbnail layout: horizontal strip on
  /// the narrow fixed panel, vertical list on the wide side panel and sheet.
  Widget _skeletonRail(BuildContext context, bool vertical) {
    return ListView(
      scrollDirection: vertical ? Axis.vertical : Axis.horizontal,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(
        14,
        4,
        14,
        sheet ? MediaQuery.paddingOf(context).bottom + 12 : 12,
      ),
      children: List.generate(
        4,
        (_) => SkeletonBox(
          width: vertical ? double.infinity : 100,
          height: 96,
          margin: vertical
              ? const EdgeInsets.only(bottom: 8)
              : const EdgeInsets.only(right: 8),
          radius: const BorderRadius.all(Radius.circular(12)),
        ),
      ),
    );
  }

  Widget _loadMoreTile() {
    return GestureDetector(
      onTap: onLoadMore,
      child: Container(
        width: wide ? double.infinity : 80,
        height: wide ? 64 : double.infinity,
        margin: wide
            ? const EdgeInsets.only(top: 8)
            : const EdgeInsets.only(right: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: primaryBlue.withValues(alpha: 0.05),
          border: Border.all(color: primaryBlue.withValues(alpha: 0.15)),
        ),
        alignment: Alignment.center,
        child: loadingMore
            // Shimmer instead of a spinner while the next page resolves.
            ? const SkeletonBox(
                width: 24,
                height: 24,
                radius: BorderRadius.all(Radius.circular(6)),
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.add_photo_alternate_outlined, color: primaryBlue, size: 20),
                  const SizedBox(height: 4),
                  Text(
                    '+$pendingCount',
                    style: const TextStyle(
                      fontSize: 10,
                      color: primaryBlue,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _thumbnailTile(DroneImage img) {
    return _PressScale(
      onTap: () => onImageTap(img),
      child: Container(
        width: wide ? double.infinity : 100,
        height: wide ? 96 : double.infinity,
        margin: wide
            ? const EdgeInsets.only(bottom: 8)
            : const EdgeInsets.only(right: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: const Color(0xFFf1f5f9),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Cloudinary thumbnail — capped decode, disk-cached.
            CachedNetworkImage(
              imageUrl: cloudinaryTransformUrl(img.fileUrl, kCloudinaryThumbMedium),
              fit: BoxFit.cover,
              memCacheWidth: 200,
              maxWidthDiskCache: 400,
              // Shimmer fills the tile while the Cloudinary transform loads.
              placeholder: (context, url) => const SkeletonBox(
                radius: BorderRadius.zero,
              ),
              errorWidget: (context, url, error) => const Center(
                child: Icon(Icons.broken_image, color: Color(0xFFcbd5e1), size: 24),
              ),
            ),
            if (img.type != null)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  color: ink.withValues(alpha: 0.55),
                  child: Text(
                    img.type!.toUpperCase().replaceAll('_', ' '),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 8,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Press affordance shared by the panel's tappable tiles: the child scales
/// down 4% while pressed and springs back on release (transform-only motion).
class _PressScale extends StatefulWidget {
  final VoidCallback onTap;
  final Widget child;

  const _PressScale({required this.onTap, required this.child});

  @override
  State<_PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<_PressScale> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      child: AnimatedScale(
        scale: _pressed ? 0.96 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: widget.child,
      ),
    );
  }
}
