import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

/// Offline/online indicator shared by the Home dashboard and the Profile
/// header. Listens to the same connectivity_plus stream whose state the
/// SyncService gates on, so the chip and the sync engine can't disagree.
///
/// connectivity_plus v6+ returns [List<ConnectivityResult>] — the offline
/// test is `contains(ConnectivityResult.none)`, never `== .none` (the
/// equality comparison is always false on these versions).
class ConnectivityStatusChip extends StatefulWidget {
  /// Render white-on-translucent styling designed for dark branded surfaces
  /// (the Profile hero header). Default is the light-surface slate look.
  final bool onDarkSurface;

  const ConnectivityStatusChip({super.key, this.onDarkSurface = false});

  @override
  State<ConnectivityStatusChip> createState() => _ConnectivityStatusChipState();
}

class _ConnectivityStatusChipState extends State<ConnectivityStatusChip> {
  bool _online = true;

  @override
  void initState() {
    super.initState();
    _readInitial();
    Connectivity().onConnectivityChanged.listen((results) {
      if (!mounted) return;
      setState(() => _online = !results.contains(ConnectivityResult.none));
    });
  }

  Future<void> _readInitial() async {
    final results = await Connectivity().checkConnectivity();
    if (!mounted) return;
    setState(() => _online = !results.contains(ConnectivityResult.none));
  }

  @override
  Widget build(BuildContext context) {
    final accent = _online ? const Color(0xFF22C55E) : Colors.amber[800]!;
    final label = _online ? "Online" : "Offline";
    final bg = widget.onDarkSurface
        ? Colors.black.withValues(alpha: 0.18)
        : const Color(0xFFF1F5F9);
    final fg = widget.onDarkSurface ? Colors.white : accent;

    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: widget.onDarkSurface
              ? Colors.white.withValues(alpha: 0.15)
              : const Color(0xFFE2E8F0),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_online ? Icons.wifi : Icons.wifi_off, size: 12, color: fg),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
              color: fg,
            ),
          ),
        ],
      ),
    );

    // The amber/green dot mirrors the state so the difference is readable
    // on both light and dark styling without carrying the fg color over.
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        chip,
      ],
    );
  }
}
