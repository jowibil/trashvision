import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../services/insights_service.dart';

/// In-app critical-area alert card (brief Task 3d). Read-only: mobile has
/// no admin surface, acknowledgement is the web dashboard's action.
///
/// Layout:
///  - Unacknowledged alerts: severity-tinted rows — severity dot, area name
///    in bold, message text under it.
///  - Monthly digest: a single muted line at the bottom of the card.
///
/// Severity hexes come from the shared `severityScale` (the map legend /
/// hex fills source of truth) so the alert card and the map can never
/// drift apart on color meaning.
class AlertsCard extends StatefulWidget {
  const AlertsCard({super.key});

  @override
  State<AlertsCard> createState() => _AlertsCardState();
}

class _AlertsCardState extends State<AlertsCard> {
  late Future<ActiveInsights?> _insights;

  @override
  void initState() {
    super.initState();
    _insights = InsightsService.getActiveInsights();
  }

  /// Alert-severity strings ('Critical'/'High'/'Medium'/'Low' from the
  /// backend) mapped onto the shared scale's colors.
  Color _severityColor(String? severity) {
    switch (severity) {
      case 'Critical':
        return const Color(0xFFb91c1c);
      case 'High':
        return const Color(0xFFea580c);
      case 'Medium':
        return const Color(0xFFeab308);
      default:
        return const Color(0xFF22c55e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ActiveInsights?>(
      future: _insights,
      builder: (context, snapshot) {
        while (snapshot.connectionState == ConnectionState.waiting) {
          return const SizedBox.shrink();
        }
        final insights = snapshot.data;
        if (insights == null ||
            (insights.alerts.isEmpty && insights.digest == null)) {
          return const SizedBox.shrink();
        }

        final alerts = insights.alerts;
        final digest = insights.digest;

        return MapPanel(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _header(alerts.length),
              const SizedBox(height: 12),
              for (var i = 0; i < alerts.length; i++) ...[
                if (i > 0) const SizedBox(height: 10),
                _alertRow(alerts[i]),
              ],
              if (digest != null) ...[
                const Hairline(),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.verified_outlined,
                        size: 14, color: inkMuted),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        digest.message,
                        style: const TextStyle(
                          fontSize: 11,
                          height: 1.45,
                          color: inkMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _header(int alertCount) {
    return Row(
      children: [
        const Icon(Icons.campaign_outlined, size: 16, color: ink),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            'Critical area alerts',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: ink,
            ),
          ),
        ),
        Eyebrow('$alertCount active'),
      ],
    );
  }

  Widget _alertRow(InsightAlert alert) {
    final color = _severityColor(alert.severity);
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: alert.areaName ?? 'Area',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: ink,
                        ),
                      ),
                      TextSpan(
                        text: ' — ${alert.severity ?? 'Alert'}',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: color,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  alert.message,
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.45,
                    color: ink.withValues(alpha: 0.85),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
