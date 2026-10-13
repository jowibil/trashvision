import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/image_detail_dialog.dart';
import '../widgets/sector_panel.dart';
import '../config/theme.dart';
import '../config/app_config.dart';
import '../models/mobile_map_models.dart';
import '../services/map_offline_tile_cache.dart';
import '../services/mobile_map_service.dart';
import '../widgets/report_detail_sheet.dart';
import '../widgets/skeleton.dart';

// ─── Design Theme Utilities ──────────────────────────────────────────────────
// ─── Map View Widget ─────────────────────────────────────────────────────────
class MapView extends StatefulWidget {
  const MapView({super.key});

  @override
  State<MapView> createState() => _MapViewState();
}

class _MapViewState extends State<MapView> with TickerProviderStateMixin {
  final MapController _mapController = MapController();
  List<AreaModel> areas = [];
  AreaModel? currentArea;
  
  List<HexBin> hexbins = [];

  // Community layer: verified citizen reports for the selected area
  // (secondary layer — failures leave the map fully functional, hexbins are
  // the primary layer).
  List<ReportPin> reportPins = [];
  bool showReports = true;
  bool reportsFailed = false;
  List<DroneImage> drawerImages = [];
  // FIX (Step 4): distinguishes "batch request failed" from "sector is empty"
  // — the drawer previously showed the same 'No images found' text for both.
  bool drawerError = false;
  bool drawerOpen = false;
  HexBin? selectedSector;
  DateTime selectedDate = DateTime.now();
  int week = 4;
  int threshold = 2;
  // Window mode (product decision 2026-10): "month" = per-month reporting
  // view (calendar + week chips); "accumulated" = Jan 1 → end of the picked
  // month, no week chips, higher min/cell slider ceiling. Default: month.
  String viewMode = 'month';
  // FIX (audit #14 - "Manual zoom tracking rebuilds the entire widget tree"):
  // this used to be a plain `double zoom` mutated via setState() inside
  // onMapEvent, so every pan/zoom frame rebuilt the whole screen (map tiles,
  // controls, drawer — everything), not just the 3 zoom-gated map layers
  // below. A ValueNotifier + ValueListenableBuilder scopes the rebuild to
  // just those layers.
  final ValueNotifier<double> _zoomNotifier = ValueNotifier<double>(15);

  // Hex polygons are their own tap targets: the layer reports hits through
  // this notifier (populated during MapOptions.onTap's hit test), which
  // replaces the old count-bubble MarkerLayer entirely.
  final LayerHitNotifier<HexBin> _hexHitNotifier = ValueNotifier(null);

  // Camera flight animation (see _animatedMove).
  AnimationController? _cameraAnim;
  String searchQuery = '';
  bool searchOpen = false;
  bool loading = false;
  // Distinguishes "network/HTTP failure" from "legitimately no data" — the
  // old UI rendered the same 'No detections' toast for both.
  String? loadError;

  // Offline-first (cache-then-network): true when the currently displayed
  // areas/hexbins came from the on-device cache. Drives the amber
  // "cached data" banner so users know it may be stale, without hiding data.
  bool showingCachedData = false;

  // FIX (audit #6 remediation - "Cap the drawer list (page size 20, load
  // more)"): a sector's image_ids can number in the hundreds; fetching /
  // rendering all of them at once was the other half of the OOM risk
  // alongside the undersized thumbnail decode (already fixed above).
  static const int _imagePageSize = 20;
  List<String> _pendingImageIds = [];
  bool _loadingMoreImages = false;

  // FIX: the threshold slider used to call _onFilterChanged() directly inside
  // onChanged, firing a full hex-tile API request per pixel of drag. Debounce
  // it so only the settled value triggers a fetch.
  Timer? _filterDebounce;

  @override
  void initState() {
    super.initState();
    _loadAreas();
  }

  @override
  void dispose() {
    _filterDebounce?.cancel();
    _zoomNotifier.dispose();
    _cameraAnim?.dispose();
    super.dispose();
  }

  void _onFilterChangedDebounced() {
    _filterDebounce?.cancel();
    _filterDebounce = Timer(const Duration(milliseconds: 400), _onFilterChanged);
  }

  Future<void> _loadAreas() async {
    // Cache-then-network: cached areas render instantly (also offline);
    // a fresh fetch replaces them when the network cooperates.
    final result = await MobileMapService.getAreasCached();
    if (!mounted) return;
    if (result.data == null) {
      setState(() => loadError = 'Could not load areas. Check your connection.');
      return;
    }
    setState(() {
      loadError = null;
      showingCachedData = result.fromCache;
      areas = result.data!;
      if (areas.isNotEmpty && currentArea == null) currentArea = areas.first;
    });
    if (areas.isNotEmpty) {
      await _fetchMapData(areas.first.areaId);
      await _fetchReportPins(areas.first.areaId);
    }
  }

  /// Verified community report pins for the area (cache-then-network).
  /// Deliberately quiet on failure: no full-width banner for a secondary
  /// layer — the toggle in the controls panel shows a small offline icon.
  Future<void> _fetchReportPins(String areaId) async {
    try {
      final result = await MobileMapService.getReportPinsCached(areaId);
      if (!mounted) return;
      setState(() {
        reportPins = result.data!;
        reportsFailed = false;
      });
    } catch (e) {
      debugPrint('fetchReportPins error: $e');
      if (!mounted) return;
      setState(() => reportsFailed = true);
    }
  }

  Future<void> _fetchMapData(String areaId) async {
    // Show whatever we already have immediately (stale-while-revalidate);
    // don't blank the map during a refresh.
    setState(() {
      loading = true;
      loadError = null;
    });
    try {
      final result = await MobileMapService.getHexBinsCached(
        areaId: areaId,
        selectedDate: selectedDate,
        week: week,
        threshold: threshold,
        mode: viewMode,
      );
      if (!mounted) return;
      setState(() {
        hexbins = result.data!;
        // Only flag cached data if the FRESH fetch didn't just succeed.
        showingCachedData = result.fromCache;
      });
    } catch (e) {
      debugPrint('fetchMapData error: $e');
      if (!mounted) return;
      // Keep stale hexbins visible instead of wiping them on a transient
      // failure, but tell the user the refresh didn't happen. If the bins on
      // screen came from the cache, say so explicitly.
      setState(() => loadError = showingCachedData
          ? 'Offline — showing cached map data.'
          : 'Map data failed to load. Retry by changing filters.');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _closeDrawer() {
    setState(() {
      drawerOpen = false;
      selectedSector = null;
      drawerImages.clear();
      _pendingImageIds.clear();
      drawerError = false;
    });
  }

  void _selectArea(AreaModel area) {
    setState(() {
      currentArea = area;
      searchOpen = false;
      searchQuery = '';
    });
    _closeDrawer();
    _animatedMove(LatLng(area.centerLatitude, area.centerLongitude), 15);
    _fetchMapData(area.areaId);
    _fetchReportPins(area.areaId);
  }

  void _onFilterChanged() {
    if (currentArea != null) {
      _fetchMapData(currentArea!.areaId);
    }
  }

  /// Curve-animated camera flight for area select + sector tap. Plain
  /// `move()` teleports and reads as "jumpy"; this tweens center + zoom over
  /// the shared motion duration. Starting a new flight replaces the old one
  /// (the previous controller is disposed lazily on the next flight/dispose).
  void _animatedMove(LatLng target, double targetZoom) {
    _cameraAnim?.dispose();
    final camera = _mapController.camera;
    final controller = AnimationController(vsync: this, duration: motionDuration);
    _cameraAnim = controller;

    final latTween = Tween<double>(begin: camera.center.latitude, end: target.latitude)
        .animate(CurvedAnimation(parent: controller, curve: motionCurve));
    final lngTween = Tween<double>(begin: camera.center.longitude, end: target.longitude)
        .animate(CurvedAnimation(parent: controller, curve: motionCurve));
    final zoomTween = Tween<double>(begin: camera.zoom, end: targetZoom)
        .animate(CurvedAnimation(parent: controller, curve: motionCurve));

    void tick() {
      if (!mounted) return;
      _mapController.move(LatLng(latTween.value, lngTween.value), zoomTween.value);
    }

    controller.addListener(tick);
    controller.forward();
  }

  void _onHexTap(HexBin hex) async {
    // Subtle tactile confirmation that the sector was registered.
    HapticFeedback.selectionClick();
    // HexBin already computes its centroid in its constructor — reuse it
    // instead of re-reducing the polygon on every tap.
    final center = hex.center;

    // The cell's items (detection ids on current backends, image ids on
    // legacy ones). Only the first page is fetched up front (audit #6);
    // the rest stay pending until "load more" is tapped.
    final cellIds = hex.detectionIds.isNotEmpty ? hex.detectionIds : hex.imageIds;
    final firstPage = cellIds.take(_imagePageSize).toList();
    final remaining = cellIds.skip(_imagePageSize).toList();

    setState(() {
      selectedSector = hex;
      drawerOpen = true;
      loading = true;
      drawerError = false;
      _pendingImageIds = remaining;
    });
    _animatedMove(center, 18);

    try {
      final isDetectionContract = hex.detectionIds.isNotEmpty;
      final images = isDetectionContract
          ? await MobileMapService.getBatchDetections(firstPage)
          : await MobileMapService.getBatchImages(firstPage);
      if (!mounted) return;
      setState(() {
        drawerImages = images;
        loading = false;
      });
    } catch (e) {
      debugPrint('getBatchImages error: $e');
      if (!mounted) return;
      setState(() {
        drawerError = true;
        loading = false;
      });
    }
  }

  Future<void> _loadMoreImages() async {
    if (_pendingImageIds.isEmpty || _loadingMoreImages) return;
    setState(() => _loadingMoreImages = true);

    final nextPage = _pendingImageIds.take(_imagePageSize).toList();
    final remaining = _pendingImageIds.skip(_imagePageSize).toList();

    try {
      final isDetectionContract = selectedSector?.detectionIds.isNotEmpty ?? false;
      final images = isDetectionContract
          ? await MobileMapService.getBatchDetections(nextPage)
          : await MobileMapService.getBatchImages(nextPage);
      if (!mounted) return;
      setState(() {
        drawerImages = [...drawerImages, ...images];
        _pendingImageIds = remaining;
        _loadingMoreImages = false;
      });
    } catch (e) {
      debugPrint('loadMoreImages error: $e');
      if (!mounted) return;
      // Keep the pending ids so the +N tile stays tappable as a retry.
      setState(() => _loadingMoreImages = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Couldn't load more images. Tap +N to retry.")),
      );
    }
  }

  /// Community report pin tap: tactile confirm, glide to the pin, detail
  /// sheet. Markers are real widgets, so this gesture wins the arena over
  /// MapOptions.onTap — a pin tap never leaks into the hex hit-notifier.
  void _onReportPinTap(ReportPin pin) {
    HapticFeedback.selectionClick();
    _animatedMove(LatLng(pin.latitude, pin.longitude), 17);
    showDialog(
      context: context,
      builder: (context) => ReportDetailSheet(pin: pin),
    );
  }

  void _showImageDetails(DroneImage img) {
    // FIX (audit #13): the old implementation called
    // networkImage.image.resolve(...).addListener(...) inside the
    // StatefulBuilder's builder, which reruns on every setModalState call —
    // stacking a new listener each time and never removing any of them
    // (memory churn, and a setState-after-dispose risk if the dialog closes
    // mid-resolve). _ImageDetailDialog below adds exactly one listener in
    // initState and removes it in dispose.
    showDialog(
      context: context,
      builder: (context) => ScaffoldMessenger(
        child: ImageDetailDialog(img: img),
      ),
    );
  }

  String _shortMonth(int m) => [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ][m - 1];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFf8fafc),
      // FIX: this screen used to hand-roll its own BottomNavigationBar with
      // pushNamed (keeps the stack), while every other screen uses the shared
      // BottomNavBar with pushNamedAndRemoveUntil (clears the stack). That
      // divergence let the back stack grow unpredictably depending on which
      // tab you came from. Reuse the shared widget everywhere.
      bottomNavigationBar: const BottomNavBar(currentIndex: 1),
      body: Column(
        children: [
          SafeArea(
            bottom: false,
            child: Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              child: Row(
                children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () => setState(() => searchOpen = !searchOpen),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                        decoration: BoxDecoration(
                          color: const Color(0xFFf1f5f9),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.location_on, size: 14, color: primaryBlue),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                currentArea?.areaName ?? 'Select Area',
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: primaryBlue),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Icon(searchOpen ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down, size: 16, color: primaryBlue),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Refresh indicator: shimmer pill (fixed slot height, so
                  // the header row never jitters when it appears/vanishes).
                  AnimatedSwitcher(
                    duration: motionDuration,
                    child: loading
                        ? const SkeletonBox(
                            key: ValueKey('header-loading'),
                            width: 64,
                            height: 18,
                            radius: BorderRadius.all(Radius.circular(9)),
                          )
                        : const SizedBox.shrink(key: ValueKey('header-idle')),
                  ),
                ],
              ),
            ),
          ),

          if (searchOpen)
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              constraints: const BoxConstraints(maxHeight: 220),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    autofocus: true,
                    onChanged: (v) => setState(() => searchQuery = v),
                    style: const TextStyle(fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'Search areas...',
                      prefixIcon: const Icon(Icons.search, size: 16, color: Colors.grey),
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      filled: true,
                      fillColor: const Color(0xFFf1f5f9),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Flexible(
                    child: SingleChildScrollView(
                      child: Column(
                        children: areas
                            .where((a) => a.areaName.toLowerCase().contains(searchQuery.toLowerCase()))
                            .map((a) => ListTile(
                                  dense: true,
                                  leading: const Icon(Icons.place, size: 16, color: primaryBlue),
                                  title: Text(a.areaName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                                  onTap: () => _selectArea(a),
                                ))
                            .toList(),
                      ),
                    ),
                  ),
                ],
              ),
            ),

          Expanded(
            child: Stack(
              children: [
                FlutterMap(
                  mapController: _mapController,
                  options: MapOptions(
                    initialCenter: LatLng(
                      currentArea?.centerLatitude ?? 7.2928,
                      currentArea?.centerLongitude ?? 125.6966,
                    ),
                    initialZoom: _zoomNotifier.value,
                    onMapEvent: (e) {
                      // FIX (audit #14): was `setState(() => zoom = ...)`,
                      // which rebuilt the entire _MapViewState (map tiles,
                      // controls, drawer, everything) on every pan/zoom
                      // frame. Updating the ValueNotifier directly notifies
                      // only the ValueListenableBuilders below.
                      //
                      // FIX: was gated on `e is MapEventMove`, which misses
                      // double-tap zoom and fling-to-zoom (MapEventFling etc.)
                      // — the hex layers could stay at the wrong zoom gate
                      // until the next drag. Every event carries a camera.
                      _zoomNotifier.value = e.camera.zoom;
                    },
                    onTap: (tapPos, latLng) {
                      // The polygon layer populates its hit notifier during
                      // this tap's hit test — a hex hit opens the sector,
                      // anything else closes the drawer.
                      final hit = _hexHitNotifier.value;
                      if (hit != null && hit.hitValues.isNotEmpty) {
                        _onHexTap(hit.hitValues.first);
                        return;
                      }
                      if (drawerOpen) _closeDrawer();
                    },
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: AppConfig.mapboxTileTemplate,
                      tileDimension: 512,
                      zoomOffset: -1,
                      userAgentPackageName: 'com.example.mobile',
                      // Offline-first tile caching: MapOfflineTileCache serves
                      // cached tiles WITHOUT deleting them when a refresh
                      // fails (the built-in cache evicts on network error,
                      // which made it useless offline). Tiles persist in the
                      // app support dir across restarts.
                      tileProvider: NetworkTileProvider(
                        cachingProvider: MapOfflineTileCache.instance,
                        silenceExceptions: true,
                      ),
                    ),

                    RepaintBoundary(
                      child: ValueListenableBuilder<double>(
                        valueListenable: _zoomNotifier,
                        builder: (context, zoom, _) {
                          if (zoom >= 18 || hexbins.isEmpty) return const SizedBox.shrink();
                          return PolygonLayer<HexBin>(
                            // Hex polygons are the only interactive layer:
                            // taps are reported via _hexHitNotifier (see
                            // MapOptions.onTap) — no marker overlay needed.
                            hitNotifier: _hexHitNotifier,
                            simplificationTolerance: 0.4,
                            polygons: hexbins
                                .map((hex) => Polygon(
                                      points: hex.polygon,
                                      // CCI (size-invariant), not raw count:
                                      // cell sizes are adaptive per area, so
                                      // counts alone would compare apples to
                                      // oranges across areas.
                                      color: getCciColor(hex.cci).withValues(alpha: 0.45),
                                      borderColor: Colors.white.withValues(alpha: 0.7),
                                      borderStrokeWidth: 1,
                                      hitValue: hex,
                                      // Count rendered on-canvas at the cell
                                      // centroid — replaces the old per-hex
                                      // marker widgets.
                                      label: '${hex.count}',
                                      labelStyle: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 10.5,
                                        fontWeight: FontWeight.w800,
                                        shadows: [
                                          Shadow(blurRadius: 3, color: Color(0x990F172A)),
                                        ],
                                      ),
                                    ))
                                .toList(),
                          );
                        },
                      ),
                    ),


                    RepaintBoundary(
                      child: ValueListenableBuilder<double>(
                        valueListenable: _zoomNotifier,
                        builder: (context, zoom, _) {
                          // Community layer: verified report pins fill the
                          // mid-zoom gap (hexes get coarse below 18, detection
                          // circles only show at 18). Distinct silhouette:
                          // brand-blue pin vs. flat detection dots.
                          if (!showReports || zoom < 16 || reportPins.isEmpty) {
                            return const SizedBox.shrink();
                          }
                          return MarkerLayer(
                            markers: reportPins.map((pin) {
                              return Marker(
                                point: LatLng(pin.latitude, pin.longitude),
                                width: 30,
                                height: 30,
                                child: GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: () => _onReportPinTap(pin),
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: primaryBlue,
                                      shape: BoxShape.circle,
                                      border: Border.all(color: Colors.white, width: 2),
                                      boxShadow: [
                                        BoxShadow(
                                          color: primaryBlue.withValues(alpha: 0.35),
                                          blurRadius: 5,
                                          spreadRadius: -1,
                                        ),
                                      ],
                                    ),
                                    child: const Icon(
                                      Icons.location_on_rounded,
                                      size: 14,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              );
                            }).toList(),
                          );
                        },
                      ),
                    ),

                    RepaintBoundary(
                      child: ValueListenableBuilder<double>(
                        valueListenable: _zoomNotifier,
                        builder: (context, zoom, _) {
                          if (zoom < 18 || drawerImages.isEmpty) return const SizedBox.shrink();
                          return CircleLayer(
                            circles: drawerImages
                                .map((img) => CircleMarker(
                                      point: LatLng(img.latitude, img.longitude),
                                      radius: 7,
                                      color: primaryBlue.withValues(alpha: 0.9),
                                      borderColor: Colors.white,
                                      borderStrokeWidth: 2,
                                    ))
                                .toList(),
                          );
                        },
                      ),
                    ),
                  ],
                ),

                if (!drawerOpen && !searchOpen) _buildControls(),
                if (drawerOpen && selectedSector != null) _buildDrawer(),

                // Offline-first: when the displayed bins/areas came from the
                // on-device cache (network failed), say so — quietly, without
                // hiding the data. Tappable to retry like the error banner.
                if (!loading &&
                    showingCachedData &&
                    loadError == null &&
                    !drawerOpen &&
                    hexbins.isNotEmpty)
                  Positioned(
                    bottom: 16,
                    left: 16,
                    right: 16,
                    child: GestureDetector(
                      onTap: () {
                        final area = currentArea;
                        if (area != null) _fetchMapData(area.areaId);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFb45309).withValues(alpha: 0.92),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.cloud_off, color: Colors.white, size: 14),
                            const SizedBox(width: 8),
                            const Expanded(
                              child: Text(
                                'Offline — showing cached map data. Tap to retry.',
                                style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
                              ),
                            ),
                            const Icon(Icons.refresh, color: Colors.white, size: 16),
                          ],
                        ),
                      ),
                    ),
                  ),

                // FIX: network failures used to be indistinguishable from
                // empty data. Now they surface as a distinct, tappable error
                // banner; stale hexbins stay visible underneath.
                if (!loading && loadError != null && !drawerOpen)
                  Positioned(
                    bottom: 16,
                    left: 16,
                    right: 16,
                    child: GestureDetector(
                      onTap: () {
                        final area = currentArea;
                        if (area != null) _fetchMapData(area.areaId);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          color: const Color(0xFFb91c1c).withValues(alpha: 0.92),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.wifi_off, color: Colors.white, size: 14),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                loadError!,
                                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
                              ),
                            ),
                            const Icon(Icons.refresh, color: Colors.white, size: 16),
                          ],
                        ),
                      ),
                    ),
                  ),

                if (!loading && loadError == null && hexbins.isEmpty && !drawerOpen)
                  Positioned(
                    bottom: 16,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.65),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text(
                          'No detections for selected period',
                          style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
                        ),
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

  Widget _buildControls() {
    // One double-bezel glass panel, hairline-divided into three sections:
    // threshold slider, period picker, legend. Staggers in on mount.
    return Positioned(
      top: 12,
      right: 12,
      child: Builder(builder: (context) {
          // Adaptive width: wider panel on tablets/landscape (decide on
          // available space, not device type). NOTE: a Positioned child of
          // the map's Stack has unbounded width, so a LayoutBuilder here
          // would always see maxWidth == infinity — read the viewport
          // instead.
          final panelWidth = MediaQuery.sizeOf(context).width > 600 ? 240.0 : 196.0;

          return StaggerIn(
            0,
            child: MapPanel(
              width: panelWidth,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // VIEW MODE — segmented pill (per-month vs accumulated),
                  // same visual language as the web's control panel.
                  Row(
                    children: [
                      for (final m in const [('Per month', 'month'), ('Accumulated', 'accumulated')])
                        Expanded(
                          child: GestureDetector(
                            onTap: () {
                              if (viewMode == m.$2) return;
                              setState(() {
                                viewMode = m.$2;
                                // Accumulated windows hold many more
                                // detections: the min/cell slider ceiling
                                // rises to 100 (product spec).
                                if (viewMode == 'accumulated' && threshold > 100) {
                                  threshold = 100;
                                }
                              });
                              _onFilterChanged();
                            },
                            child: AnimatedContainer(
                              duration: motionDuration,
                              curve: motionCurve,
                              margin: const EdgeInsets.symmetric(horizontal: 2),
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              decoration: BoxDecoration(
                                color: viewMode == m.$2 ? primaryBlue : primaryBlue.withValues(alpha: 0.06),
                                borderRadius: BorderRadius.circular(9),
                              ),
                              child: Text(
                                m.$1,
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w800,
                                  color: viewMode == m.$2 ? Colors.white : primaryBlue.withValues(alpha: 0.75),
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),

                  const Hairline(),

                  // MIN / CELL — ceiling adapts to the mode (15 monthly /
                  // 100 accumulated).
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Eyebrow('Min / cell'),
                      Text(
                        '$threshold',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          color: primaryBlue,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                  SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      trackHeight: 3,
                      thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
                      overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
                      activeTrackColor: primaryBlue,
                      inactiveTrackColor: const Color(0xFFe2e8f0),
                      thumbColor: Colors.white,
                      overlayColor: primaryBlue.withValues(alpha: 0.08),
                    ),
                    child: Slider(
                      value: threshold.clamp(1, viewMode == 'accumulated' ? 100 : 15).toDouble(),
                      min: 1,
                      max: viewMode == 'accumulated' ? 100 : 15,
                      onChanged: (v) {
                        setState(() => threshold = v.round());
                        // Debounced: one request per settled value.
                        _onFilterChangedDebounced();
                      },
                    ),
                  ),

                  const Hairline(),

                  // PERIOD — calendar always; the label explains the active
                  // window (week cutoff vs Jan→month accumulation).
                  const Eyebrow('Period'),
                  const SizedBox(height: 6),
                  GestureDetector(
                    onTap: () async {
                      final picked = await showDatePicker(
                        context: context,
                        initialDate: selectedDate,
                        firstDate: DateTime(2020),
                        lastDate: DateTime.now(),
                      );
                      if (picked != null) {
                        setState(() => selectedDate = picked);
                        _onFilterChanged();
                      }
                    },
                    child: Row(
                      children: [
                        const Icon(Icons.calendar_today_rounded, color: primaryBlue, size: 12),
                        const SizedBox(width: 6),
                        Text(
                          viewMode == 'accumulated'
                              ? 'Jan – ${_shortMonth(selectedDate.month)} ${selectedDate.year}'
                              : '${_shortMonth(selectedDate.month)} ${selectedDate.year}',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: Color(0xFF0f172a)),
                        ),
                        const Spacer(),
                        Text(
                          viewMode == 'accumulated'
                              ? 'accumulated'
                              : (week == 4 ? 'to end' : 'to ${_shortMonth(selectedDate.month)} ${week * 7}'),
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF64748b)),
                        ),
                      ],
                    ),
                  ),
                  // Week chips only exist in the per-month view — the
                  // accumulated window always runs to month end.
                  if (viewMode == 'month') ...[
                    const SizedBox(height: 8),
                    Row(
                      children: List.generate(4, (i) {
                        final w = i + 1;
                        final isActive = week == w;
                        return Expanded(
                          child: GestureDetector(
                            onTap: () {
                              setState(() => week = w);
                              _onFilterChanged();
                            },
                            child: AnimatedContainer(
                              duration: motionDuration,
                              curve: motionCurve,
                              margin: const EdgeInsets.symmetric(horizontal: 2),
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              decoration: BoxDecoration(
                                // Brand pill when active; quiet tint when not.
                                color: isActive ? primaryBlue : primaryBlue.withValues(alpha: 0.06),
                                borderRadius: BorderRadius.circular(9),
                              ),
                              child: Text(
                                'W$w',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w800,
                                  color: isActive ? Colors.white : primaryBlue.withValues(alpha: 0.75),
                                ),
                              ),
                            ),
                          ),
                        );
                      }),
                    ),
                  ],

                  const Hairline(),

                  // DENSITY LEGEND - CCI scale (single source of truth in
                  // theme.dart, mirrors the web's 5-band legend).
                  const Eyebrow('Density (CCI)'),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        for (final (color, label) in cciScale) _legendDot(color, label),
                      ],
                    ),
                  ),

                  const Hairline(),

                  // COMMUNITY REPORTS toggle (verified citizen reports as
                  // pins from zoom 16). The cloud icon appears when the
                  // pins couldn't be fetched and no cache exists.
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.location_on_rounded, size: 12, color: primaryBlue),
                            const SizedBox(width: 5),
                            const Text(
                              'Report pins',
                              style: TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF334155),
                              ),
                            ),
                            if (reportsFailed) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.cloud_off_rounded, size: 11, color: Color(0xFFb45309)),
                            ],
                          ],
                        ),
                        GestureDetector(
                          onTap: () => setState(() => showReports = !showReports),
                          child: AnimatedContainer(
                            duration: motionDuration,
                            curve: motionCurve,
                            width: 34,
                            height: 18,
                            padding: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              color: showReports ? primaryBlue : primaryBlue.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(9),
                            ),
                            child: AnimatedAlign(
                              duration: motionDuration,
                              curve: motionCurve,
                              alignment: showReports ? Alignment.centerRight : Alignment.centerLeft,
                              child: Container(
                                width: 14,
                                height: 14,
                                decoration: const BoxDecoration(
                                  color: Colors.white,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _legendDot(Color color, String label) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: color.withValues(alpha: 0.35), blurRadius: 5, spreadRadius: -1)],
            ),
          ),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF64748b))),
        ],
      );

  Widget _buildDrawer() {
    final hex = selectedSector!;

    // Adaptive: side panel on wide screens (tablet/landscape), draggable
    // bottom sheet on phones. Decided on available width, not device type.
    return Positioned.fill(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth > 600;
          final panel = SectorPanel(
            hex: hex,
            wide: wide,
            loading: loading,
            drawerError: drawerError,
            drawerImages: drawerImages,
            pendingCount: _pendingImageIds.length,
            loadingMore: _loadingMoreImages,
            onClose: _closeDrawer,
            onRetry: () => _onHexTap(hex),
            onLoadMore: _loadMoreImages,
            onImageTap: _showImageDetails,
          );
          if (wide) {
            // Side panel: right-anchored, full height, slides in from the right.
            return Align(
              alignment: Alignment.centerRight,
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: 1),
                duration: motionDuration,
                curve: motionCurve,
                builder: (context, t, _) => Transform.translate(
                  offset: Offset(40 * (1 - t), 0),
                  child: Opacity(opacity: t, child: panel),
                ),
              ),
            );
          }
          // Draggable bottom sheet (Maps-app pattern): drag to expand,
          // drag down to collapse back to peek; close via the grab handle or
          // a map tap. The outer Positioned.fill already bounds this box, so
          // the sheet fills it directly (Positioned must be a direct Stack
          // child — no wrapping here).
          return DraggableScrollableSheet(
            initialChildSize: 0.34,
            minChildSize: 0.34,
            maxChildSize: 0.85,
            snap: true,
            snapSizes: const [0.34, 0.85],
            builder: (context, scrollController) => _SheetSurface(
              onClose: _closeDrawer,
              child: SectorPanel.sheetContent(
                hex: hex,
                loading: loading,
                drawerError: drawerError,
                drawerImages: drawerImages,
                pendingCount: _pendingImageIds.length,
                loadingMore: _loadingMoreImages,
                onRetry: () => _onHexTap(hex),
                onLoadMore: _loadMoreImages,
                onImageTap: _showImageDetails,
                scrollController: scrollController,
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Chrome for the draggable sector sheet: grab handle + close button above
/// the panel content. The close action routes through the same _closeDrawer
/// (the sheet itself is removed by rebuilding without it).
class _SheetSurface extends StatelessWidget {
  final Widget child;
  final VoidCallback onClose;

  const _SheetSurface({required this.child, required this.onClose});

  @override
  Widget build(BuildContext context) {
    return Container(
      // Outer tray shell, same surface language as MapPanel/SectorPanel.
      decoration: BoxDecoration(
        color: ink.withValues(alpha: 0.06),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
        boxShadow: surfaceShadow(alpha: 0.22),
      ),
      margin: const EdgeInsets.symmetric(horizontal: 6),
      padding: const EdgeInsets.all(4),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            GestureDetector(
              onTap: onClose,
              child: Container(
                width: double.infinity,
                color: Colors.transparent,
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: ink.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ),
            ),
            Expanded(child: child),
          ],
        ),
      ),
    );
  }
}
