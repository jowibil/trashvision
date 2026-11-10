import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:lucide_icons/lucide_icons.dart';

import '../config/explainer_content.dart';
import '../config/theme.dart';
import '../helper/database_helper.dart';
import '../models/detection_sample.dart';
import '../services/api_client.dart' show logAndReport;
import '../services/api_service.dart';
import '../widgets/skeleton.dart';

/// Mobile twin of the portal's Info page (web/src/pages/Info.tsx).
///
/// Honesty contract, same as the web page: every threshold shown here is
/// either (a) served by `GET /info` from the backend constant that computes
/// with it — alert severity bands, the two DBSCAN stage params, hex sizing —
/// or (b) read straight out of `theme.dart`, which the map itself uses (CCI K
/// factor, cciScale, getCciColor/getCciLabel). Nothing is re-typed here; only
/// display wording and tints are presentation.
///
/// Offline-first like the rest of the app: the last successful payload is
/// kept in `map_cache` and shown immediately (flagged "Cached"), then
/// revalidated. A failed fetch with no cache shows an honest retry state —
/// never zeros.
const String _infoCacheKey = 'ml_info_v1';

/// Sample CCI values used only to ask `getCciLabel` for each band's name;
/// the thresholds themselves live in theme.dart's CCI scale.
const List<double> _cciLabelProbes = [1, 3, 7, 15, 30];

// ─── Formatting / parsing helpers ───────────────────────────────────────────

String _fmtInt(num? value) {
  if (value == null) return '—';
  final n = value.round();
  final digits = n.abs().toString();
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buf.write(',');
    buf.write(digits[i]);
  }
  return n < 0 ? '-$buf' : buf.toString();
}

String _fmtNum(num? value) {
  if (value == null) return '—';
  final d = value.toDouble();
  if (d == d.roundToDouble()) return _fmtInt(d.round());
  return d
      .toStringAsFixed(2)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
}

Map<String, dynamic>? _asMap(Object? value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) {
    return value.map((key, v) => MapEntry(key.toString(), v));
  }
  return null;
}

num? _asNum(Object? value) => value is num ? value : null;

List<Map<String, dynamic>> _asMapList(Object? value) {
  if (value is! List) return const [];
  final out = <Map<String, dynamic>>[];
  for (final entry in value) {
    final map = _asMap(entry);
    if (map != null) out.add(map);
  }
  return out;
}

List<String> _asStringList(Object? value) {
  if (value is! List) return const [];
  return [
    for (final entry in value)
      if (entry != null) entry.toString(),
  ];
}

/// Presentation tint for the band names the API serves. Thresholds always
/// come from the response; this is color only.
Color _bandTint(String name) {
  switch (name.toLowerCase()) {
    case 'critical':
      return critRed;
    case 'high':
      return highOrange;
    case 'medium':
      return midYellow;
    case 'low':
      return lowGreen;
    default:
      return inkFaint;
  }
}

// ─── Screen ─────────────────────────────────────────────────────────────────

class InfoScreen extends StatefulWidget {
  const InfoScreen({super.key});

  @override
  State<InfoScreen> createState() => _InfoScreenState();
}

class _InfoScreenState extends State<InfoScreen> {
  Map<String, dynamic>? _info;
  bool _loading = true;
  bool _failed = false;
  bool _fromCache = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _failed = false;
      });
    }

    // Stale-on-open: show the last good payload instantly if we have one.
    final raw = await DatabaseHelper.instance.getMapCache(_infoCacheKey);
    if (raw != null) {
      try {
        final cached = _asMap(jsonDecode(raw));
        if (cached != null && mounted) {
          setState(() {
            _info = cached;
            _fromCache = true;
            _loading = false;
          });
        }
      } catch (e) {
        logAndReport(e, context: 'info cache decode');
      }
    }

    // Revalidate; success replaces the cached copy and clears the flag.
    final fresh = await ApiService().getMlInfo();
    if (fresh != null) {
      await DatabaseHelper.instance.putMapCache(
        _infoCacheKey,
        jsonEncode(fresh),
      );
      // Keep the shared bounded cache from evicting the map/Home entries.
      await DatabaseHelper.instance.trimMapCache(
        keep: const {'areas_v1', 'logs_summary_v1', _infoCacheKey},
      );
      if (!mounted) return;
      setState(() {
        _info = fresh;
        _fromCache = false;
        _loading = false;
        _failed = false;
      });
      return;
    }

    if (!mounted) return;
    setState(() {
      _loading = false;
      // Cached numbers are still honest (just stale) — only fail when the
      // screen has nothing at all to show.
      _failed = _info == null;
    });
  }

  bool get _waitingForFirstPayload => _loading && _info == null;

  @override
  Widget build(BuildContext context) {
    final info = _info;
    final dataset = _asMap(info?['dataset']);
    final splits = _asMap(dataset?['splits']);
    final bands = _asMapList(info?['severity_bands']);
    final dedup = _asMap(info?['dedup']);
    final stageA = _asMap(dedup?['stage_a']);
    final stageB = _asMap(dedup?['stage_b']);
    final hexGrid = _asMap(info?['hex_grid']);

    final edgeMin = _asNum(hexGrid?['edge_min_m']);
    final edgeMax = _asNum(hexGrid?['edge_max_m']);
    final edgeDefault = _asNum(hexGrid?['default_edge_m']);
    final hexArea = edgeMin == null
        ? null
        : (3 * math.sqrt(3) / 2) * edgeMin * edgeMin;
    final cciWithTwo = hexArea == null ? null : (2 * cciKFactor) / hexArea;
    final moderateNeeds = hexArea == null
        ? null
        : (5 * hexArea / cciKFactor).ceil();

    final stageBIou = _asNum(stageB?['iou_threshold']);
    final stageBMinSamples = _asNum(stageB?['min_samples']);
    // Retired pre-2026-11-11 rule (gsd_factor × gsd_meters). Displayed only in
    // the "what changed" note — never applied as a live threshold.
    final gsdFactor = _asNum(stageB?['gsd_factor']);
    final gsdMeters = _asNum(stageB?['gsd_meters']);
    final legacyStageBRadius = gsdFactor != null && gsdMeters != null
        ? gsdFactor * gsdMeters
        : null;

    // Alert band display ranges, derived from the served thresholds — the map
    // CCI edges (Critical "> 20", High "11 – 20", Medium "6 – 10", Low "≤ 5").
    String bandRange(int index) {
      final above = _asNum(bands[index]['above']);
      if (above == null) return '—';
      if (index == 0) return '> ${_fmtNum(above)}';
      if (above < 0) return '≤ ${_fmtNum(_asNum(bands[index - 1]['above']))}';
      return '${_fmtNum(above + 1)} – ${_fmtNum(_asNum(bands[index - 1]['above']))}';
    }

    return Scaffold(
      backgroundColor: surfaceLight,
      appBar: AppBar(
        backgroundColor: surfaceLight,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ink,
        titleSpacing: 0,
        title: const Text(
          'How it works',
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w900,
            color: ink,
            letterSpacing: -0.3,
          ),
        ),
      ),
      body: ListView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          // ── Header ──────────────────────────────────────────────────────
          const Eyebrow('Documentation'),
          const SizedBox(height: 6),
          const Text(
            'How TrashVision works',
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w900,
              color: ink,
              letterSpacing: -0.6,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 10),
          _para(
            'How TrashVision detects, de-duplicates and maps coastal waste — '
            'and which numbers decide an alert. Every threshold below is served '
            'by the API from the same constant the code computes with, or read '
            'straight from the app; only display wording is presentation.',
          ),
          if (_fromCache) ...[const SizedBox(height: 12), _cacheNote()],

          const SizedBox(height: 26),
          _sectionHeading('From photo to alert, in four steps'),
          const SizedBox(height: 12),
          _stepRow([
            (
              1,
              'Survey',
              'A drone flight captures geotagged photos of a drawn area.',
            ),
            (
              2,
              'De-duplicate',
              'Stage A skips repeat frames before inference. Stage B merges '
                  'repeat boxes inside a frame.',
            ),
          ]),
          const SizedBox(height: 10),
          _stepRow([
            (
              3,
              'Count',
              'Surviving detections are counted per drawn area and per hex cell.',
            ),
            (
              4,
              'Report',
              'The area density drives alerts, badges and the assistant; '
                  'per-cell density drives the map colors.',
            ),
          ]),

          // ── The model ───────────────────────────────────────────────────
          const SizedBox(height: 26),
          _sectionHeading('The model, and what it did not learn from'),
          const SizedBox(height: 12),
          _panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Eyebrow('Images the model was trained on'),
                const SizedBox(height: 10),
                if (_waitingForFirstPayload)
                  const SkeletonBox(
                    width: 140,
                    height: 40,
                    radius: BorderRadius.all(Radius.circular(10)),
                  )
                else
                  Text(
                    _fmtInt(_asNum(dataset?['total_images'])),
                    style: const TextStyle(
                      fontSize: 44,
                      fontWeight: FontWeight.w900,
                      color: primaryBlue,
                      height: 1,
                      letterSpacing: -1.5,
                    ),
                  ),
                const SizedBox(height: 10),
                if (_waitingForFirstPayload)
                  const SkeletonBox(
                    width: double.infinity,
                    height: 34,
                    radius: BorderRadius.all(Radius.circular(8)),
                  )
                else
                  _para(
                    dataset == null
                        ? (info == null
                              ? 'Counts temporarily unavailable.'
                              : 'Dataset details unavailable.')
                        : 'Roboflow export v${dataset['version'] ?? '—'}, YOLOv8 '
                              'format. ${_fmtInt(_asNum(splits?['train']))} train'
                              ' · ${_fmtInt(_asNum(splits?['valid']))} validation'
                              ' · ${_fmtInt(_asNum(splits?['test']))} test — fixed at '
                              'training time; it does not grow as the platform collects more data.',
                    size: 11.5,
                    color: inkFaint,
                  ),
                if (dataset != null &&
                    _asStringList(dataset['classes']).isNotEmpty) ...[
                  const SizedBox(height: 14),
                  const Eyebrow('The five classes it recognizes'),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final cls in _asStringList(dataset['classes']))
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: surfaceBody,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            cls.replaceAll('_', ' '),
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: inkDeep,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
                const Hairline(),
                const Eyebrow('Not in training'),
                const SizedBox(height: 10),
                if (_waitingForFirstPayload)
                  const SkeletonBox(
                    width: 64,
                    height: 32,
                    radius: BorderRadius.all(Radius.circular(8)),
                  )
                else
                  Text(
                    _fmtInt(_asNum(info?['verified_reports_contributed'])),
                    style: const TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w900,
                      color: inkDeep,
                      height: 1,
                      letterSpacing: -1,
                    ),
                  ),
                const SizedBox(height: 8),
                _para(
                  'Verified community reports counted from the database. The '
                  'model has not learned from them — no retraining pipeline '
                  'exists, by design.',
                  size: 11.5,
                  color: inkFaint,
                ),
              ],
            ),
          ),
          if (_failed) ...[const SizedBox(height: 10), _errorRow()],

          // ── Training ────────────────────────────────────────────────────
          const SizedBox(height: 26),
          _sectionHeading('How the detector was trained'),
          const SizedBox(height: 8),
          _para(
            'Four steps, in order. The values are the run that produced the '
            'checkpoint the backend serves — read from its own training '
            'arguments, not estimated.',
            size: 12.5,
            color: inkMuted,
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < trainingSteps.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            _trainingCard(i + 1, trainingSteps[i]),
          ],
          const SizedBox(height: 10),
          _para(
            'Training arguments and wall-clock time come from the run\'s '
            'args.yaml and results.csv; the image counts come from the export\'s '
            'own data.yaml.',
            size: 11.5,
            color: inkFaint,
          ),

          // ── Comparison ──────────────────────────────────────────────────
          const SizedBox(height: 26),
          _sectionHeading('Which detector, and how well it scores'),
          const SizedBox(height: 8),
          _para(
            'Three detectors were trained and scored on the same five classes. '
            'YOLOv8 led on every aggregate metric, so that is the family we kept '
            '— and then fine-tuned. Bold figures mark the best value in each '
            'row.',
            size: 12.5,
            color: inkMuted,
          ),
          const SizedBox(height: 12),
          _baseComparePanel(),
          const SizedBox(height: 12),
          _deployedPanel(),
          const SizedBox(height: 12),
          _perClassPanel(),

          // ── Sample ──────────────────────────────────────────────────────
          const SizedBox(height: 26),
          _sectionHeading('One frame, before and after the model'),
          const SizedBox(height: 8),
          _para(
            'A real survey frame at the operating point the backend uses, with '
            'the boxes the detector actually returned. Drag the divider to '
            'compare, then raise the confidence cut-off and watch detections '
            'drop out: what survives is what reaches the map.',
            size: 12.5,
            color: inkMuted,
          ),
          const SizedBox(height: 12),
          const _DetectionSampleCard(),

          // ── De-duplication ──────────────────────────────────────────────
          const SizedBox(height: 26),
          _sectionHeading(
            'Before anything is counted: the two de-duplication stages',
          ),
          const SizedBox(height: 8),
          _para(
            'A hovering drone photographs the same piece of trash many times, '
            'and one photo can contain the same object twice. Both stages run '
            'before counting, so every number downstream — map, alerts, '
            'assistant — is de-duplicated.',
            size: 12.5,
            color: inkMuted,
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _stageBadge('1'),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _para(
                      'Stage A — between frames',
                      size: 13,
                      color: ink,
                      weight: FontWeight.w800,
                    ),
                    const SizedBox(height: 6),
                    _para(
                      'Frames are clustered by their camera GPS positions '
                      '(haversine distance). Only the first frame of each '
                      'cluster (upload order) runs inference — its centroid '
                      'coordinates travel with it; the rest are marked '
                      'duplicates and skipped. Frames without GPS cannot be '
                      'placed spatially, so they are always kept.',
                      size: 12.5,
                    ),
                    const SizedBox(height: 10),
                    _statRow([
                      (
                        'Neighborhood radius',
                        '${_fmtNum(_asNum(stageA?['eps_meters']))} m',
                      ),
                      ('min_samples', _fmtInt(_asNum(stageA?['min_samples']))),
                    ]),
                    const SizedBox(height: 8),
                    _statRow([
                      ('Keeps', 'one representative frame'),
                      ('Exception', 'no-GPS frames always kept'),
                    ]),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _stageBadge('2'),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _para(
                      'Stage B — within a frame',
                      size: 13,
                      color: ink,
                      weight: FontWeight.w800,
                    ),
                    const SizedBox(height: 6),
                    _para(
                      'Every raw box in one frame is stamped with the single '
                      'GPS fix that frame carries, so a distance test cannot '
                      'tell "two boxes on one bottle" from "two bottles a '
                      'frame apart". Overlap can: boxes whose '
                      'intersection-over-union (IoU) reaches the threshold are '
                      'one object. The match is class-agnostic on purpose — two '
                      'boxes on the same cup routinely disagree (styrofoam vs '
                      'plastic), and keeping one per label is exactly the '
                      'double count this stage exists to remove. The '
                      'highest-confidence box survives and donates its own '
                      'label; a box that overlaps nothing stays a singleton, so '
                      'clustering never discards a detection.',
                      size: 12.5,
                    ),
                    const SizedBox(height: 10),
                    _statRow([
                      (
                        'Overlap threshold',
                        stageBIou == null
                            ? '—'
                            : 'IoU ≥ ${_fmtNum(stageBIou)}',
                      ),
                      ('min_samples', _fmtInt(stageBMinSamples)),
                    ]),
                    const SizedBox(height: 8),
                    _statRow([
                      ('Keeps', 'highest-confidence box'),
                      ('Labels', 'merged across classes'),
                    ]),
                    if (legacyStageBRadius != null) ...[
                      const SizedBox(height: 8),
                      _para(
                        'What changed (2026-11-11): this stage used to merge '
                        'boxes nearer than ${_fmtNum(gsdFactor)} × a fixed GSD '
                        'of ${_fmtNum(gsdMeters)} m — '
                        '${_fmtNum(legacyStageBRadius)} m. Every box in a frame '
                        'carries the same GPS fix, so that radius collapsed '
                        'each frame into a single detection. The API still '
                        'serves those two numbers, flagged legacy, as history.',
                        size: 11.5,
                        color: inkFaint,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),

          // ── CCI ─────────────────────────────────────────────────────────
          const SizedBox(height: 26),
          _sectionHeading('What the map colors mean: the Clean Coast Index'),
          const SizedBox(height: 12),
          _panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _para(
                  'Each surveyed area is covered by an adaptive hex grid — cell '
                  'size derived from the drawn boundary'
                  '${hexGrid == null ? '' : ' (edges clamped between ${_fmtNum(edgeMin)} m and ${_fmtNum(edgeMax)} m; ${_fmtNum(edgeDefault)} m where no boundary is drawn)'}'
                  ', cells clipped to the boundary. For every cell:',
                  size: 12.5,
                ),
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: surfaceBody,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: surfaceBorder),
                  ),
                  child: Text(
                    'CCI = ${_fmtNum(cciKFactor)} × detections ÷ cell area',
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: ink,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                _para(
                  'Dividing by the cell\'s real geodesic area makes the color '
                  'size-invariant: a big sparse hex and a small packed hex with '
                  'the same litter density get the same color, so adaptive cell '
                  'sizes cannot skew what the map says.',
                  size: 12.5,
                ),
                if (hexArea != null &&
                    cciWithTwo != null &&
                    moderateNeeds != null) ...[
                  const SizedBox(height: 10),
                  _para(
                    'Worked example at the real minimum: a full cell with a '
                    '${_fmtNum(edgeMin)} m edge covers about ${_fmtInt(hexArea)} m² '
                    '(a regular hexagon is 3√3⁄2·a²), so 2 detections in it score '
                    'CCI ≈ ${_fmtNum(cciWithTwo)} — "${getCciLabel(cciWithTwo)}". '
                    'The Moderate band would need more than ${_fmtInt(moderateNeeds)} '
                    'detections inside that single cell. Only cells clipped down at '
                    'the boundary can be far smaller — a ~30 m² sliver reaches the '
                    'top of the first band with just 3 detections.',
                    size: 12.5,
                  ),
                ],
                const SizedBox(height: 10),
                _para(
                  'Said plainly: at drone-survey cell sizes the CCI scale is almost '
                  'never reached above "${getCciLabel(1)}". That is the '
                  'size-invariance trade-off working as designed (K stays '
                  '${_fmtNum(cciKFactor)}); the count itself still matters for '
                  'cleanup planning, which is what the other ruler below is for.',
                  size: 12.5,
                ),
                const SizedBox(height: 14),
                _cciLegend(),
              ],
            ),
          ),

          // ── One ruler, two zoom levels ──────────────────────────────────
          const SizedBox(height: 26),
          _sectionHeading('One ruler, two zoom levels'),
          const SizedBox(height: 8),
          _para(
            'Alerts, badges and the assistant rate the whole drawn area; the '
            'map colors rate one cell at a time. Both use the same Clean Coast '
            'Index — same K, same band edges — so they cannot tell '
            'contradictory stories about the same place.',
            size: 12.5,
            color: inkMuted,
          ),
          const SizedBox(height: 12),
          _panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.warning_amber_rounded,
                      size: 16,
                      color: primaryBlue,
                    ),
                    const SizedBox(width: 8),
                    _para(
                      'Alerts, badges, chatbot',
                      size: 13,
                      color: ink,
                      weight: FontWeight.w800,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _para(
                  'Based on the Clean Coast Index of the whole drawn area — '
                  'all-time de-duplicated detections divided by its geodesic '
                  'area, times ${_fmtNum(cciKFactor)}. Same edges as the map '
                  'cells, with the two clean bands collapsed into Low:',
                  size: 11.5,
                  color: inkMuted,
                ),
                const SizedBox(height: 10),
                if (_waitingForFirstPayload)
                  const SkeletonBox(
                    width: double.infinity,
                    height: 72,
                    radius: BorderRadius.all(Radius.circular(12)),
                  )
                else if (bands.isEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: surfaceBody,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: surfaceBorder),
                    ),
                    child: _para(
                      'Threshold values unavailable — the deployed backend is an '
                      'older build that does not serve them yet.'
                      '${_failed ? ' The API also did not respond.' : ''}',
                      size: 11.5,
                      color: inkMuted,
                    ),
                  )
                else
                  for (var i = 0; i < bands.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: _bandRow(
                        bands[i]['name']?.toString() ?? '—',
                        bandRange(i),
                      ),
                    ),
                const SizedBox(height: 4),
                _para(
                  'One shared function rates the alert banner, the Trash Logs '
                  'hotspot badges and the assistant, so those can never '
                  'disagree with each other. An area with no drawn boundary has '
                  'no denominator — no density — so it can never rate above '
                  'Low.',
                  size: 11.5,
                  color: inkFaint,
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.map_outlined,
                      size: 16,
                      color: primaryBlue,
                    ),
                    const SizedBox(width: 8),
                    _para(
                      'Map hexagons',
                      size: 13,
                      color: ink,
                      weight: FontWeight.w800,
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _para(
                  'Based on litter density per hex cell — detections divided by '
                  'the cell\'s real geodesic area, times ${_fmtNum(cciKFactor)}. '
                  'This screen\'s map classifies cells with theme.dart '
                  'getCciColor, the web map with classifyCci — same thresholds, '
                  'same colors, different label wording:',
                  size: 11.5,
                  color: inkMuted,
                ),
                const SizedBox(height: 10),
                _cciLegend(),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _para(
                  'Why the alert and the map always describe the same place',
                  size: 13,
                  color: ink,
                  weight: FontWeight.w800,
                ),
                const SizedBox(height: 8),
                _para(
                  'Alerts answer "which area needs a cleanup sweep?" — density '
                  'over the whole boundary. The map answers "inside that area, '
                  'where exactly is the waste?" — the same density, computed '
                  'one cell at a time. Same K, same band edges: a cell cannot '
                  'land in a different band than the area it sits in at the '
                  'same density.',
                  size: 12.5,
                ),
                const SizedBox(height: 10),
                _para(
                  'Raising an alert takes real density. Critical is CCI above '
                  '${bands.isEmpty ? '—' : _fmtNum(_asNum(bands.first['above']))} '
                  'and CCI = ${_fmtNum(cciKFactor)} × detections ÷ area, so '
                  'crossing it takes more than one de-duplicated detection per '
                  'square metre of the drawn area. Redrawing a larger boundary '
                  'raises the denominator and lowers the CCI with no cleanup at '
                  'all, while the count printed beside it never changes.',
                  size: 12.5,
                ),
                const SizedBox(height: 10),
                _para(
                  'That is why cell colors never fire alerts: cell size is a '
                  'presentational choice, so if alerts keyed off cells, '
                  'redrawing or resizing the grid could create — or silently '
                  'silence — a Critical alert. The alert ladder reads one '
                  'number: the CCI of the area itself, the same figure on the '
                  'map header chip.',
                  size: 12.5,
                ),
              ],
            ),
          ),

          // ── Limits ──────────────────────────────────────────────────────
          const SizedBox(height: 26),
          _sectionHeading('Known limits'),
          const SizedBox(height: 10),
          _bullets(const [
            'The training set is fixed. The model does not learn from new reports, and there is no retraining pipeline, by design.',
            'Frames without GPS cannot be matched against other frames, so the same object may be counted more than once.',
            'Alert severity is the whole area CCI over its all-time count: it never resets on its own, and redrawing a larger boundary lowers it without any cleanup.',
            'The CCI scale factor (K = 20) is not yet calibrated against real survey data, so alerts and cell colors are conservative — they under-report rather than over-report.',
            'The model recognizes five classes only.',
            'CCI values are small at drone scale — the color scale is rarely reached above its first band (see the Clean Coast Index section).',
          ]),

          // ── Sources ─────────────────────────────────────────────────────
          const SizedBox(height: 26),
          _sectionHeading('Where the numbers come from'),
          const SizedBox(height: 10),
          _para(
            'Alerts. Counts and areas are computed in SQL over the '
            'de-duplicated detections, one shared function turns the area CCI '
            'into a severity (the hotspot badges and the assistant call it '
            'too), and alert wording comes from a fixed template — a message '
            'cannot invent a figure.',
            size: 12.5,
          ),
          const SizedBox(height: 10),
          _para(
            'The assistant. It is given a live data block of the same computed '
            'numbers (the worst areas, plus any area you name, refreshed at most '
            'every 90 seconds) and only explains them in plain language — it does '
            'not calculate.',
            size: 12.5,
          ),
          const SizedBox(height: 10),
          _para(
            'Counts do not decay. The numerator is the all-time de-duplicated '
            'count of the area, and it never decreases on its own — only if the '
            'underlying detection rows are removed from the database. There is '
            'no post-cleanup reset workflow, so a swept beach keeps its CCI, '
            'and its alert level, until those rows go.',
            size: 12.5,
          ),

          // ── Team ────────────────────────────────────────────────────────
          const SizedBox(height: 26),
          _sectionHeading('Built by'),
          const SizedBox(height: 8),
          _para(
            'TrashVision is built and maintained by three people. Everything on '
            'this screen exists so their work can be checked rather than taken '
            'on trust.',
            size: 12.5,
            color: inkMuted,
          ),
          const SizedBox(height: 12),
          for (var i = 0; i < team.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            _teamCard(team[i]),
          ],
          if (team.any((m) => m.placeholderCount > 0)) ...[
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(LucideIcons.users, size: 13, color: inkFaint),
                const SizedBox(width: 6),
                Expanded(
                  child: _para(
                    'Dashed icons are placeholders — those profiles are not '
                    'published yet, so nothing there links anywhere. Each one '
                    'becomes a real link the moment a URL is added.',
                    size: 11.5,
                    color: inkFaint,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  // ─── Training / comparison builders ───────────────────────────────────────

  String _pct(double value, [int digits = 1]) => '${value.toStringAsFixed(digits)}%';

  Widget _trainingCard(int number, TrainingStep step) {
    return _panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 24,
                height: 24,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: primaryBlue,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  '$number',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  step.title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    color: ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _para(step.body, size: 12.5),
          const SizedBox(height: 10),
          for (final (label, value) in step.facts)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 96,
                    child: Text(
                      label,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: inkMuted,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      value,
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                        color: inkDeep,
                        height: 1.35,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// Metric labels shared by the comparison table and the deployed card, in the
  /// same order as [ModelScore]'s fields.
  static const List<String> _metricLabels = [
    'mAP@50',
    'mAP@50-95',
    'Precision',
    'Recall',
    'F1',
  ];

  List<double> _metricValues(ModelScore model) => [
    model.map50,
    model.map5095,
    model.precision,
    model.recall,
    f1Score(model.precision, model.recall),
  ];

  Widget _baseComparePanel() {
    final rows = [for (final model in baseModels) _metricValues(model)];
    // Best value per metric across the three base detectors — computed, never
    // hand-marked, so the bold figures cannot drift from the numbers.
    final best = [
      for (var m = 0; m < _metricLabels.length; m++)
        rows.map((row) => row[m]).reduce((a, b) => a > b ? a : b),
    ];

    return _panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Eyebrow('Base training'),
          const SizedBox(height: 10),
          Table(
            columnWidths: const {
              0: FlexColumnWidth(1.6),
              1: FlexColumnWidth(1),
              2: FlexColumnWidth(1),
              3: FlexColumnWidth(1),
            },
            children: [
              TableRow(
                children: [
                  const SizedBox.shrink(),
                  for (final model in baseModels)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6, left: 4),
                      child: Text(
                        model.name,
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: inkMuted,
                          height: 1.2,
                        ),
                      ),
                    ),
                ],
              ),
              for (var m = 0; m < _metricLabels.length; m++)
                TableRow(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5),
                      child: Text(
                        _metricLabels[m],
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          color: inkMuted,
                        ),
                      ),
                    ),
                    for (var i = 0; i < baseModels.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(top: 5, bottom: 5, left: 4),
                        child: Text(
                          _pct(rows[i][m]),
                          textAlign: TextAlign.right,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: rows[i][m] == best[m]
                                ? FontWeight.w900
                                : FontWeight.w600,
                            color: rows[i][m] == best[m] ? ink : inkMuted,
                          ),
                        ),
                      ),
                  ],
                ),
            ],
          ),
          const Hairline(),
          _para(
            'YOLOv8 is the row we kept. F1 is derived here as 2PR/(P+R), so it '
            'always matches the precision and recall beside it.',
            size: 11.5,
            color: inkFaint,
          ),
        ],
      ),
    );
  }

  Widget _deployedPanel() {
    final values = _metricValues(fineTuned);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: primaryBlue.withValues(alpha: 0.2)),
        boxShadow: surfaceShadow(alpha: 0.03),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Icon(LucideIcons.award, size: 16, color: primaryBlue),
              Text(
                fineTuned.name,
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w900,
                  color: ink,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: primaryBlue,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'DEPLOYED',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _para(
            'The checkpoint the backend loads, scored on the validation split of '
            'the v11 export at the 1280 px training size. One 22.6 MB file '
            'detects all five classes — no separate model per class.',
            size: 12,
            color: inkStrong,
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, constraints) {
              final tileWidth = (constraints.maxWidth - 8) / 2;
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (var m = 0; m < _metricLabels.length; m++)
                    SizedBox(
                      width: tileWidth,
                      child: _statTile(
                        _metricLabels[m].toUpperCase(),
                        _pct(values[m], 2),
                      ),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _perClassPanel() {
    return _panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Eyebrow('Per-class mAP@50-95'),
          const SizedBox(height: 10),
          Table(
            columnWidths: const {
              0: FlexColumnWidth(1.5),
              1: FlexColumnWidth(1.1),
              2: FlexColumnWidth(1),
            },
            children: [
              const TableRow(
                children: [
                  SizedBox.shrink(),
                  Padding(
                    padding: EdgeInsets.only(bottom: 6, left: 4),
                    child: Text(
                      'BASE BEST',
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                        color: inkFaint,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                  Padding(
                    padding: EdgeInsets.only(bottom: 6, left: 4),
                    child: Text(
                      'FINE-TUNED',
                      textAlign: TextAlign.right,
                      style: TextStyle(
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                        color: primaryBlue,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ],
              ),
              for (final row in perClassScores)
                TableRow(
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Text(
                        row.cls.replaceAll('_', ' '),
                        style: const TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                          color: inkDeep,
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 6, bottom: 6, left: 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            _pct(row.bestBase),
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: inkStrong,
                            ),
                          ),
                          Text(
                            row.bestBaseModel,
                            textAlign: TextAlign.right,
                            style: const TextStyle(fontSize: 9, color: inkFaint),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 6, bottom: 6, left: 4),
                      child: Text(
                        _pct(row.fineTuned),
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w900,
                          color: primaryBlue,
                        ),
                      ),
                    ),
                  ],
                ),
            ],
          ),
          const Hairline(),
          _para(
            'The aggregate win is not a clean sweep: on base training SSD edges '
            'the others on metal and Faster R-CNN leads on styrofoam. The '
            'fine-tuned column is the point — every class finishes at 59% or '
            'better, where the base detectors sat between 5.6% and 31.6%.',
            size: 11.5,
            color: inkFaint,
          ),
        ],
      ),
    );
  }

  // ─── Team builders ────────────────────────────────────────────────────────

  IconData _teamLinkIcon(TeamLink link) {
    switch (link) {
      case TeamLink.github:
        return LucideIcons.github;
      case TeamLink.linkedin:
        return LucideIcons.linkedin;
      case TeamLink.facebook:
        return LucideIcons.facebook;
      case TeamLink.instagram:
        return LucideIcons.instagram;
    }
  }

  Widget _teamCard(TeamMember member) {
    return _panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipOval(
                child: Image.asset(
                  member.photo,
                  width: 52,
                  height: 52,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => Container(
                    width: 52,
                    height: 52,
                    color: surfaceBody,
                    child: const Icon(
                      LucideIcons.user,
                      size: 22,
                      color: inkFaint,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      member.name,
                      style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w900,
                        color: ink,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: primaryBlue.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            teamRoleIcon(member.role),
                            size: 11,
                            color: primaryBlue,
                          ),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              member.role.toUpperCase(),
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w900,
                                color: primaryBlue,
                                letterSpacing: 0.6,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Hairline(),
          Row(
            children: [
              for (final link in teamLinkOrder) ...[
                _teamLinkButton(member, link),
                const SizedBox(width: 6),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _teamLinkButton(TeamMember member, TeamLink link) {
    final label = teamLinkLabels[link] ?? '';
    final href = member.links[link] ?? '';
    final icon = Icon(_teamLinkIcon(link), size: 15);

    if (href.isEmpty) {
      return Semantics(
        label: '$label: not published yet',
        child: CustomPaint(
          painter: const _DashedBorderPainter(color: surfaceBorder, radius: 10),
          child: SizedBox(
            width: 32,
            height: 32,
            child: Center(child: IconTheme.merge(
              data: const IconThemeData(color: inkDisabled),
              child: icon,
            )),
          ),
        ),
      );
    }

    return Semantics(
      button: true,
      label: '${member.name} on $label',
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => _copyTeamLink(member, label, href),
        child: Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: surfaceBorder),
          ),
          child: IconTheme.merge(
            data: const IconThemeData(color: inkMuted),
            child: icon,
          ),
        ),
      ),
    );
  }

  /// No URL-opening package ships with the app, so a filled-in link copies its
  /// address instead of pretending to open it. Swap in `url_launcher` here when
  /// the profiles actually exist — the data file needs no change.
  Future<void> _copyTeamLink(TeamMember member, String label, String href) async {
    await Clipboard.setData(ClipboardData(text: href));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        content: Text('Copied ${member.name}\'s $label link'),
      ),
    );
  }

  // ─── Small builders ───────────────────────────────────────────────────────

  Widget _para(
    String text, {
    double size = 13,
    Color color = inkStrong,
    FontWeight weight = FontWeight.w500,
  }) {
    return Text(
      text,
      style: TextStyle(
        fontSize: size,
        height: 1.5,
        color: color,
        fontWeight: weight,
        letterSpacing: -0.05,
      ),
    );
  }

  Widget _sectionHeading(String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 4,
          height: 22,
          margin: const EdgeInsets.only(top: 1),
          decoration: BoxDecoration(
            color: primaryBlue,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w900,
              color: ink,
              height: 1.25,
              letterSpacing: -0.3,
            ),
          ),
        ),
      ],
    );
  }

  Widget _panel({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: surfaceBorder),
        boxShadow: [
          BoxShadow(
            color: ink.withValues(alpha: 0.02),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }

  /// Two step cards side by side, forced to the same height so the pair's
  /// bottoms line up regardless of how each body wraps.
  Widget _stepRow(List<(int, String, String)> steps) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0) const SizedBox(width: 10),
            Expanded(child: _stepCard(steps[i].$1, steps[i].$2, steps[i].$3)),
          ],
        ],
      ),
    );
  }

  Widget _stepCard(int number, String title, String body) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: surfaceBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: primaryBlue,
              shape: BoxShape.circle,
            ),
            child: Text(
              '$number',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: ink,
            ),
          ),
          const SizedBox(height: 4),
          _para(body, size: 11.5, color: inkMuted),
        ],
      ),
    );
  }

  Widget _stageBadge(String label) {
    return Container(
      width: 26,
      height: 26,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: primaryBlue.withValues(alpha: 0.1),
        shape: BoxShape.circle,
        border: Border.all(color: primaryBlue.withValues(alpha: 0.25)),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w900,
          color: primaryBlue,
        ),
      ),
    );
  }

  Widget _statRow(List<(String, String)> items) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(child: _statTile(items[i].$1, items[i].$2)),
        ],
      ],
    );
  }

  Widget _statTile(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: surfaceLight,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: surfaceBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              color: inkMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: const TextStyle(
              fontSize: 12,
              color: inkDeep,
              fontWeight: FontWeight.w800,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }

  Widget _bandRow(String name, String range) {
    final tint = _bandTint(name);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: surfaceBorder),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              name.toUpperCase(),
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w900,
                color: tint,
                letterSpacing: 0.4,
              ),
            ),
          ),
          const Spacer(),
          Text(
            range,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: inkDeep,
            ),
          ),
        ],
      ),
    );
  }

  Widget _cciLegend() {
    return Column(
      children: [
        for (var i = 0; i < cciScale.length; i++)
          Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: cciScale[i].$1.withValues(alpha: 0.07),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(
                    color: cciScale[i].$1,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    getCciLabel(
                      i < _cciLabelProbes.length ? _cciLabelProbes[i] : null,
                    ),
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                      color: inkDeep,
                    ),
                  ),
                ),
                Text(
                  'CCI ${cciScale[i].$2}',
                  style: const TextStyle(fontSize: 11, color: inkMuted),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _bullets(List<String> items) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final item in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 5,
                  height: 5,
                  margin: const EdgeInsets.only(top: 7),
                  decoration: const BoxDecoration(
                    color: inkDisabled,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(child: _para(item, size: 12.5)),
              ],
            ),
          ),
      ],
    );
  }

  Widget _cacheNote() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: warningAmber.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: warningAmber.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_outlined, size: 14, color: warningAmber),
          const SizedBox(width: 8),
          Expanded(
            child: _para(
              'Showing the last saved numbers. Refresh when you are back online.',
              size: 11,
              color: warningAmber,
            ),
          ),
        ],
      ),
    );
  }

  Widget _errorRow() {
    return Row(
      children: [
        Expanded(
          child: _para(
            "Couldn't load model details.",
            size: 11.5,
            color: alertRed,
          ),
        ),
        TextButton(
          onPressed: _load,
          style: TextButton.styleFrom(
            foregroundColor: alertRed,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            minimumSize: const Size(0, 32),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: const Text(
            'Retry',
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800),
          ),
        ),
      ],
    );
  }
}

// ─── Sample frame: before and after the model ───────────────────────────────

/// Same palette as the web page and ml/preview_stage_b.py, so a box looks the
/// same here as in the local previews the team reviews.
const Map<String, Color> _sampleClassColors = {
  'composite_packaging': Color(0xFF56D656),
  'glass': Color(0xFFFFC83C),
  'metal': Color(0xFFC8C8C8),
  'plastic': Color(0xFF2882FF),
  'styrofoam': Color(0xFFFF78B4),
};
const Color _sampleFallbackColor = Color(0xFFE5E7EB);

/// One real frame with its detections. The divider can be dragged on the image
/// or nudged with the slider below it — the slider exists so the comparison is
/// reachable without a precise drag, and it is the only state the two share.
class _DetectionSampleCard extends StatefulWidget {
  const _DetectionSampleCard();

  @override
  State<_DetectionSampleCard> createState() => _DetectionSampleCardState();
}

class _DetectionSampleCardState extends State<_DetectionSampleCard> {
  final DetectionSample _sample = detectionSample;
  double _reveal = 45;
  late double _conf = _sample.inferenceConf;
  final Set<String> _hidden = <String>{};

  List<SampleDetection> get _visible => [
    for (final det in _sample.detections)
      if (det.confidence >= _conf && !_hidden.contains(det.label)) det,
  ];

  List<(String, int)> get _classCounts {
    final counts = <String, int>{};
    for (final det in _sample.detections) {
      counts[det.label] = (counts[det.label] ?? 0) + 1;
    }
    // Highest count first, alphabetical tiebreak — the same order the chips
    // render in on the web page.
    final entries = counts.entries.toList()
      ..sort((a, b) => b.value != a.value
          ? b.value.compareTo(a.value)
          : a.key.compareTo(b.key));
    return [for (final e in entries) (e.key, e.value)];
  }

  Color _colorFor(String label) => _sampleClassColors[label] ?? _sampleFallbackColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: surfaceBorder),
        boxShadow: [
          BoxShadow(
            color: ink.withValues(alpha: 0.02),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _frame(),
          Container(height: 1, color: surfaceBorder),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(LucideIcons.search, size: 13, color: inkMuted),
                    const SizedBox(width: 6),
                    const Text(
                      'CLASSES',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: inkFaint,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final (label, count) in _classCounts)
                      _classChip(label, count),
                  ],
                ),
                const SizedBox(height: 14),
                _sliderLabel('Divider', '${_reveal.round()}% raw'),
                Slider(
                  value: _reveal,
                  min: 0,
                  max: 100,
                  divisions: 100,
                  activeColor: primaryBlue,
                  inactiveColor: surfaceBorder,
                  label: '${_reveal.round()}%',
                  onChanged: (value) => setState(() => _reveal = value),
                ),
                _sliderLabel(
                  'Confidence cut-off',
                  '${(_conf * 100).round()}%',
                ),
                Slider(
                  value: _conf,
                  min: _sample.inferenceConf,
                  max: 0.95,
                  divisions: ((0.95 - _sample.inferenceConf) / 0.01).round(),
                  activeColor: primaryBlue,
                  inactiveColor: surfaceBorder,
                  label: '${(_conf * 100).round()}%',
                  onChanged: (value) => setState(() => _conf = value),
                ),
                _body(
                  'The pipeline itself runs at '
                  '${(_sample.inferenceConf * 100).round()}%.',
                  size: 10.5,
                  color: inkFaint,
                ),
                const SizedBox(height: 8),
                _countText(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _frame() {
    final widthPx = _sample.imageWidth.toDouble();
    final heightPx = _sample.imageHeight.toDouble();

    return AspectRatio(
      aspectRatio: widthPx / heightPx,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final height = constraints.maxHeight;
          final split = width * (_reveal / 100);

          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            // Horizontal only: the frame sits inside a vertical list, so a
            // vertical gesture has to keep scrolling the page.
            onHorizontalDragUpdate: (details) {
              setState(() {
                _reveal = (details.localPosition.dx / width).clamp(0.0, 1.0) * 100;
              });
            },
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.asset(
                  _sample.imageFile,
                  fit: BoxFit.cover,
                  gaplessPlayback: true,
                ),
                ClipRect(
                  clipper: _RevealClipper(_reveal / 100),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.asset(
                        _sample.imageFile,
                        fit: BoxFit.cover,
                        gaplessPlayback: true,
                      ),
                      for (final det in _visible)
                        _box(det, width, height, widthPx, heightPx),
                    ],
                  ),
                ),
                Positioned(
                  left: split - 1,
                  top: 0,
                  bottom: 0,
                  child: Container(
                    width: 2,
                    color: Colors.white.withValues(alpha: 0.9),
                  ),
                ),
                Positioned(
                  left: split - 14,
                  top: height / 2 - 14,
                  child: IgnorePointer(
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        boxShadow: surfaceShadow(alpha: 0.25),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.chevron_left, size: 14, color: inkDeep),
                          Icon(Icons.chevron_right, size: 14, color: inkDeep),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned(left: 8, top: 8, child: _tag('Raw frame')),
                Positioned(right: 8, top: 8, child: _tag('Detections')),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _box(
    SampleDetection det,
    double width,
    double height,
    double widthPx,
    double heightPx,
  ) {
    final color = _colorFor(det.label);
    return Positioned(
      left: det.box[0] / widthPx * width,
      top: det.box[1] / heightPx * height,
      width: (det.box[2] - det.box[0]) / widthPx * width,
      height: (det.box[3] - det.box[1]) / heightPx * height,
      child: IgnorePointer(
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(color: color, width: 1.2),
            color: color.withValues(alpha: 0.12),
          ),
        ),
      ),
    );
  }

  Widget _tag(String text) {
    return IgnorePointer(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.65),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          text.toUpperCase(),
          style: const TextStyle(
            fontSize: 8,
            fontWeight: FontWeight.w900,
            color: Colors.white,
            letterSpacing: 0.6,
          ),
        ),
      ),
    );
  }

  Widget _classChip(String label, int count) {
    final off = _hidden.contains(label);
    final color = _colorFor(label);

    return Semantics(
      button: true,
      selected: !off,
      label: '${label.replaceAll('_', ' ')}: $count detections',
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => setState(() {
          if (off) {
            _hidden.remove(label);
          } else {
            _hidden.add(label);
          }
        }),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
            color: off ? Colors.white : surfaceLight,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: off ? surfaceBorder : inkDisabled),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: off ? inkDisabled : color,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 5),
              // Flexible + ellipsis so a long class name (or a large system
              // font) degrades instead of overflowing the chip's row.
              Flexible(
                child: Text(
                  label.replaceAll('_', ' '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: off ? inkFaint : inkDeep,
                    decoration: off ? TextDecoration.lineThrough : null,
                  ),
                ),
              ),
              const SizedBox(width: 4),
              Text(
                '$count',
                style: const TextStyle(fontSize: 11, color: inkMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Label on the left, live value on the right. The value is flexible and
  /// ellipsised: at 320 px (or with the system font scaled up) a fixed-width
  /// pair of labels is the first thing to overflow.
  Widget _sliderLabel(String label, String value) {
    return Row(
      children: [
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
              color: inkMuted,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          value,
          style: const TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w800,
            color: ink,
          ),
        ),
      ],
    );
  }

  Widget _countText() {
    final visible = _visible.length;
    if (visible == 0) {
      return _body(
        'Nothing survives this threshold or class filter — that is the honest '
        'answer, not a rendering glitch.',
        size: 12,
        color: inkStrong,
      );
    }
    return _body(
      'Showing $visible of ${_sample.detectionCount} stored detections. The frame '
      'returned ${_sample.rawBoxes} raw boxes; Stage B merged '
      '${_sample.mergedCount} of them away '
      '(IoU ≥ ${_sample.stageBIouThreshold.toStringAsFixed(1)}), which is why the '
      'map counts ${_sample.detectionCount} for this photo — not '
      '${_sample.rawBoxes}.',
      size: 12,
      color: inkStrong,
    );
  }

  Widget _body(String text, {required double size, required Color color}) {
    return Text(
      text,
      style: TextStyle(
        fontSize: size,
        height: 1.5,
        color: color,
        fontWeight: FontWeight.w500,
        letterSpacing: -0.05,
      ),
    );
  }
}

/// Clips the annotated copy of the frame to the part right of the divider.
class _RevealClipper extends CustomClipper<Rect> {
  /// How much of the LEFT side stays raw, 0–1.
  final double rawFraction;

  const _RevealClipper(this.rawFraction);

  @override
  Rect getClip(Size size) => Rect.fromLTRB(
    size.width * rawFraction,
    0,
    size.width,
    size.height,
  );

  @override
  bool shouldReclip(_RevealClipper oldClipper) =>
      oldClipper.rawFraction != rawFraction;
}

/// Dashed rounded border, drawn by hand — Flutter has no dashed [Border], and a
/// placeholder must read as one at a glance.
class _DashedBorderPainter extends CustomPainter {
  final Color color;
  final double radius;

  const _DashedBorderPainter({required this.color, required this.radius});

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius)),
      );
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    const dash = 3.0;
    const gap = 3.0;
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = math.min(distance + dash, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance = next + gap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.radius != radius;
}
