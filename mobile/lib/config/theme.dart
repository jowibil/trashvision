import 'package:flutter/material.dart';

/// Shared color constants for the app. Mapview previously defined
/// `primaryBlue` in module scope; hoisting it here so other screens and
/// widgets can reference the same brand color without importing a screen.
const Color primaryBlue = Color(0xFF005D90);

/// Brand ink (slate-950-ish) used for hairlines, shadows, and high-emphasis
/// text on light surfaces.
const Color ink = Color(0xFF0f172a);
const Color inkMuted = Color(0xFF64748b);
const Color inkFaint = Color(0xFF94a3b8);

// ─── Motion language ─────────────────────────────────────────────────────────
// One curve + duration for the map's floating chrome so every surface moves
// with the same physical weight. Transform/opacity only — never layout props.

const Duration motionDuration = Duration(milliseconds: 420);
const Curve motionCurve = Curves.easeOutCubic;

// ─── Surface language ────────────────────────────────────────────────────────

/// Soft, highly diffused ambient shadow: large blur, low alpha, negative
/// spread. Replaces harsh small-radius card shadows (high-end-visual-design).
List<BoxShadow> surfaceShadow({double alpha = 0.14}) => [
      BoxShadow(
        color: ink.withValues(alpha: alpha),
        blurRadius: 28,
        offset: const Offset(0, 10),
        spreadRadius: -8,
      ),
    ];

/// Hairline divider — a 1px wash of ink, never a solid gray border.
class Hairline extends StatelessWidget {
  const Hairline({super.key});

  @override
  Widget build(BuildContext context) => Container(
        height: 1,
        margin: const EdgeInsets.symmetric(vertical: 10),
        color: ink.withValues(alpha: 0.06),
      );
}

/// Micro-label for panel sections: uppercase, wide tracking, faint ink.
class Eyebrow extends StatelessWidget {
  final String text;
  const Eyebrow(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w800,
          color: inkFaint,
          letterSpacing: 1.2,
        ),
      );
}

/// Double-bezel floating surface for the map's control cluster: an outer tray
/// shell (ink wash + hairline white border + soft shadow) wrapped around an
/// inner white core, with concentric radii (24 outer / 20 inner).
class MapPanel extends StatelessWidget {
  final double? width;
  final EdgeInsetsGeometry padding;
  final Widget child;

  const MapPanel({
    super.key,
    this.width,
    this.padding = const EdgeInsets.fromLTRB(14, 12, 14, 8),
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
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
        padding: padding,
        child: child,
      ),
    );
  }
}

/// Staggered entrance for the map's floating chrome: each element waits
/// [index] * 70ms, then fades and lifts in over the shared motion duration.
/// Transform/opacity only — never layout props.
class StaggerIn extends StatelessWidget {
  final int index;
  final Widget child;

  const StaggerIn(this.index, {super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    const step = Duration(milliseconds: 70);
    final total = motionDuration + step * index;
    final begin = step.inMilliseconds / total.inMilliseconds;

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: total,
      curve: Interval(begin, 1, curve: motionCurve),
      builder: (context, t, child) => Transform.translate(
        offset: Offset(0, 14 * (1 - t)),
        child: Opacity(opacity: t, child: child),
      ),
      child: child,
    );
  }
}

// ─── Severity scale (single source of truth) ─────────────────────────────────
// Legend, hex polygon fills, and drawer badges all read from this list so the
// three can never drift apart.

typedef SeverityLevel = (Color, String);

const List<SeverityLevel> severityScale = [
  (Color(0xFF22c55e), 'Low'),
  (Color(0xFFeab308), 'Mid'),
  (Color(0xFFea580c), 'High'),
  (Color(0xFFb91c1c), 'Crit'),
];

Color getDensityColor(int count) {
  if (count > 10) return const Color(0xFFb91c1c);
  if (count > 5) return const Color(0xFFea580c);
  if (count > 2) return const Color(0xFFeab308);
  return const Color(0xFF22c55e);
}

String getDensityLabel(int count) {
  if (count > 10) return 'CRITICAL';
  if (count > 5) return 'HIGH';
  if (count > 2) return 'MID';
  return 'LOW';
}

// ─── CCI scale (spec: algorithm_equations.md §2.3) ──────────────────────────
// Clean Coast Index bands + colors, shared with the web map
// (useHexbins.ts classifyCci — same thresholds, same hexes). Map severity is
// size-invariant: cells classify by CCI = K · count / geodesic area, never by
// raw count, so adaptive per-area cell sizes can't skew colors. Web labels:
// Very clean / Clean / Moderate / Dirty / Extremely dirty.

/// Spec K: CCI = K · litter_density. Same value the web uses.
const double cciKFactor = 20;

Color getCciColor(double? cci) {
  if (cci == null) return const Color(0xFF22c55e); // no area data → old low band
  if (cci <= 2) return const Color(0xFF10b981); // very clean (emerald)
  if (cci <= 5) return const Color(0xFF3b82f6); // clean (blue)
  if (cci <= 10) return const Color(0xFFf59e0b); // moderate (amber)
  if (cci <= 20) return const Color(0xFFf97316); // dirty (orange)
  return const Color(0xFFef4444); // extremely dirty (red)
}

String getCciLabel(double? cci) {
  if (cci == null) return 'LOW';
  if (cci <= 2) return 'VERY CLEAN';
  if (cci <= 5) return 'CLEAN';
  if (cci <= 10) return 'MODERATE';
  if (cci <= 20) return 'DIRTY';
  return 'EXTREMELY DIRTY';
}

/// Legend rows for the map panel — mirrors the web's CCI legend.
const List<(Color, String)> cciScale = [
  (Color(0xFF10b981), '≤2'),
  (Color(0xFF3b82f6), '2-5'),
  (Color(0xFFf59e0b), '5-10'),
  (Color(0xFFf97316), '10-20'),
  (Color(0xFFef4444), '>20'),
];
