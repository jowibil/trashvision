import 'package:flutter/material.dart';
import '../config/theme.dart';

/// Skeleton shimmer placeholder — the app's "loading" language for map
/// surfaces (sector drawer tiles, header refresh pill) instead of spinners.
///
/// A quiet ink-wash box (same surface language as [MapPanel]'s tray shell)
/// with a highlight band sweeping across it. Transform-only motion; colors
/// come from the shared ink tokens, never hardcoded greys.
///
/// Null [width]/[height] expands to the parent's constraints (fills stacks),
/// so the same widget works for fixed-shape pills and fill-the-tile
/// placeholders alike.
class SkeletonBox extends StatefulWidget {
  final double? width;
  final double? height;
  final BorderRadiusGeometry radius;
  final EdgeInsetsGeometry? margin;

  const SkeletonBox({
    super.key,
    this.width,
    this.height,
    this.radius = const BorderRadius.all(Radius.circular(8)),
    this.margin,
  });

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: widget.margin ?? EdgeInsets.zero,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(
              color: ink.withValues(alpha: 0.06),
              borderRadius: widget.radius,
            ),
            foregroundDecoration: BoxDecoration(
              borderRadius: widget.radius,
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [
                  Colors.transparent,
                  ink.withValues(alpha: 0.10),
                  Colors.transparent,
                ],
                stops: const [0.35, 0.5, 0.65],
                transform: _SweepGradientTransform(_controller.value),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Slides the highlight gradient from fully off-left to fully off-right as
/// [t] goes 0 → 1.
class _SweepGradientTransform extends GradientTransform {
  final double t;
  const _SweepGradientTransform(this.t);

  @override
  Matrix4? transform(Rect bounds, {TextDirection? textDirection}) =>
      Matrix4.translationValues(bounds.width * (2 * t - 1), 0, 0);
}
