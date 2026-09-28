import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
// Thumbnail decoding for the drawer's 100px cells: CachedNetworkImage
// disk/mem-caches the bytes and memCacheWidth caps the decoded bitmap size
// (audit #6: Image.network decoded full-res drone imagery with no cache
// bound -> OOM crashes on mid-range devices).
import 'package:cached_network_image/cached_network_image.dart';
import '../widgets/bottom_nav.dart';
import '../widgets/image_detail_dialog.dart';
import '../config/theme.dart';
import '../config/app_config.dart';
import '../models/mobile_map_models.dart';
import '../services/mobile_map_service.dart';

// ─── Cloudinary Thumbnail Helper ──────────────────────────────────────────────
/// FIX (audit #2.4 - "Lazy Image Loading & OOM Prevention", biggest single
/// win per the audit): backend/services/cloudinary_service.py uploads via
/// `cloudinary.uploader.upload(...)` and returns the raw `secure_url` with no
/// transform applied, so the drawer was downloading the full original drone
/// frame (often several MB / 4K) just to show a 100px thumbnail. Cloudinary
/// renders any transform on-demand by inserting params into the URL path
/// after `/upload/` — this needs NO backend change, since Cloudinary derives
/// the thumbnail from the original upload at request time.
///
/// Falls back to the untouched URL if it doesn't look like a Cloudinary
/// `/upload/` URL (e.g. local/dev fixtures), so this never breaks non-prod data.
String cloudinaryThumbUrl(String url) {
  const marker = '/upload/';
  final idx = url.indexOf(marker);
  if (idx == -1) return url;
  final insertAt = idx + marker.length;
  return '${url.substring(0, insertAt)}w_320,h_240,c_fill,q_auto,f_auto/${url.substring(insertAt)}';
}

// ─── Design Theme Utilities ──────────────────────────────────────────────────
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

// ─── Map View Widget ─────────────────────────────────────────────────────────
class MapView extends StatefulWidget {
  const MapView({super.key});

  @override
  State<MapView> createState() => _MapViewState();
}

class _MapViewState extends State<MapView> {
  final MapController _mapController = MapController();
  List<AreaModel> areas = [];
  AreaModel? currentArea;
  
  List<HexBin> hexbins = [];
  List<DroneImage> drawerImages = [];
  // FIX (Step 4): distinguishes "batch request failed" from "sector is empty"
  // — the drawer previously showed the same 'No images found' text for both.
  bool drawerError = false;
  bool drawerOpen = false;
  HexBin? selectedSector;
  DateTime selectedDate = DateTime.now();
  int week = 4;
  int threshold = 2;
  // FIX (audit #14 - "Manual zoom tracking rebuilds the entire widget tree"):
  // this used to be a plain `double zoom` mutated via setState() inside
  // onMapEvent, so every pan/zoom frame rebuilt the whole screen (map tiles,
  // controls, drawer — everything), not just the 3 zoom-gated map layers
  // below. A ValueNotifier + ValueListenableBuilder scopes the rebuild to
  // just those layers.
  final ValueNotifier<double> _zoomNotifier = ValueNotifier<double>(15);
  String searchQuery = '';
  bool searchOpen = false;
  bool loading = false;
  // Distinguishes "network/HTTP failure" from "legitimately no data" — the
  // old UI rendered the same 'No detections' toast for both.
  String? loadError;

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
    super.dispose();
  }

  void _onFilterChangedDebounced() {
    _filterDebounce?.cancel();
    _filterDebounce = Timer(const Duration(milliseconds: 400), _onFilterChanged);
  }

  Future<void> _loadAreas() async {
    final data = await MobileMapService.getAreas();
    if (!mounted) return;
    if (data == null) {
      setState(() => loadError = 'Could not load areas. Check your connection.');
      return;
    }
    setState(() {
      loadError = null;
      areas = data;
      if (data.isNotEmpty) currentArea = data.first;
    });
    if (data.isNotEmpty) await _fetchMapData(data.first.areaId);
  }

  Future<void> _fetchMapData(String areaId) async {
    setState(() {
      loading = true;
      loadError = null;
    });
    try {
      final bins = await MobileMapService.getHexBins(
        areaId: areaId,
        selectedDate: selectedDate,
        week: week,
        threshold: threshold,
      );
      if (!mounted) return;
      setState(() => hexbins = bins);
    } catch (e) {
      debugPrint('fetchMapData error: $e');
      if (!mounted) return;
      // Keep stale hexbins visible instead of wiping them on a transient
      // failure, but tell the user the refresh didn't happen.
      setState(() => loadError = 'Map data failed to load. Retry by changing filters.');
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
    _mapController.move(LatLng(area.centerLatitude, area.centerLongitude), 15);
    _fetchMapData(area.areaId);
  }

  void _onFilterChanged() {
    if (currentArea != null) {
      _fetchMapData(currentArea!.areaId);
    }
  }

  void _onHexTap(HexBin hex) async {
    // HexBin already computes its centroid in its constructor — reuse it
    // instead of re-reducing the polygon on every tap.
    final center = hex.center;

    // FIX (audit #6 remediation): only fetch/render the first page of image
    // ids up front; the rest stay pending until "load more" is tapped.
    final firstPage = hex.imageIds.take(_imagePageSize).toList();
    final remaining = hex.imageIds.skip(_imagePageSize).toList();

    setState(() {
      selectedSector = hex;
      drawerOpen = true;
      loading = true;
      drawerError = false;
      _pendingImageIds = remaining;
    });
    _mapController.move(center, 18);

    try {
      final images = await MobileMapService.getBatchImages(firstPage);
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
      final images = await MobileMapService.getBatchImages(nextPage);
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
                  SizedBox(
                    width: 20,
                    height: 20,
                    child: loading ? const CircularProgressIndicator(strokeWidth: 2, color: primaryBlue) : null,
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
                      if (drawerOpen) _closeDrawer();
                    },
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: AppConfig.mapboxTileTemplate,
                      tileDimension: 512,
                      zoomOffset: -1,
                      userAgentPackageName: 'com.example.mobile',
                    ),

                    RepaintBoundary(
                      child: ValueListenableBuilder<double>(
                        valueListenable: _zoomNotifier,
                        builder: (context, zoom, _) {
                          if (zoom >= 18 || hexbins.isEmpty) return const SizedBox.shrink();
                          return PolygonLayer(
                            polygons: hexbins
                                .map((hex) => Polygon(
                                      points: hex.polygon,
                                      color: getDensityColor(hex.count).withValues(alpha: 0.45),
                                      borderColor: Colors.white.withValues(alpha: 0.7),
                                      borderStrokeWidth: 1,
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
                          if (zoom >= 18 || hexbins.isEmpty) return const SizedBox.shrink();
                          return MarkerLayer(
                            markers: hexbins.map((hex) {
                              return Marker(
                                point: hex.center,
                                width: 34,
                                height: 34,
                                child: GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: () => _onHexTap(hex),
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: Colors.black.withValues(alpha: 0.4),
                                      shape: BoxShape.circle,
                                      border: Border.all(color: Colors.white, width: 1.5),
                                    ),
                                    child: Center(
                                      child: Text(
                                        '${hex.count}',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
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
    return Positioned(
      top: 12,
      right: 12,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            width: 190,
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 2),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.95),
              borderRadius: BorderRadius.circular(14),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 8)],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'MIN/CELL',
                      style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: Color(0xFF94a3b8), letterSpacing: 0.8),
                    ),
                    Text('$threshold', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: primaryBlue)),
                  ],
                ),
                SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 2,
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                    overlayShape: const RoundSliderOverlayShape(overlayRadius: 12),
                  ),
                  child: Slider(
                    value: threshold.toDouble(),
                    min: 1,
                    max: 15,
                    activeColor: primaryBlue,
                    inactiveColor: const Color(0xFFe2e8f0),
                    onChanged: (v) {
                      setState(() => threshold = v.round());
                      // FIX: debounced instead of firing a request per pixel dragged.
                      _onFilterChangedDebounced();
                    },
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Container(
            width: 190,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF0f172a).withValues(alpha: 0.92),
              borderRadius: BorderRadius.circular(14),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.2), blurRadius: 8)],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
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
                      const Icon(Icons.calendar_today, color: Color(0xFF60a5fa), size: 11),
                      const SizedBox(width: 5),
                      Text(
                        '${_shortMonth(selectedDate.month)} ${selectedDate.year}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white),
                      ),
                      const Spacer(),
                      Text(
                        'up to ${week == 4 ? "end" : "${_shortMonth(selectedDate.month)} ${week * 7}"}',
                        style: const TextStyle(fontSize: 9, color: Color(0xFF60a5fa)),
                      ),
                    ],
                  ),
                ),
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
                          duration: const Duration(milliseconds: 120),
                          margin: const EdgeInsets.symmetric(horizontal: 1.5),
                          padding: const EdgeInsets.symmetric(vertical: 5),
                          decoration: BoxDecoration(
                            color: isActive ? const Color(0xFF3b82f6) : const Color(0xFF1e293b),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'W$w',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: isActive ? Colors.white : const Color(0xFF64748b)),
                          ),
                        ),
                      ),
                    );
                  }),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.95),
              borderRadius: BorderRadius.circular(10),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 6)],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _legendDot(const Color(0xFF22c55e), 'Low'),
                _legendDot(const Color(0xFFeab308), 'Mid'),
                _legendDot(const Color(0xFFea580c), 'High'),
                _legendDot(const Color(0xFFb91c1c), 'Crit'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _legendDot(Color color, String label) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(
          children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
            const SizedBox(width: 3),
            Text(label, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFF64748b))),
          ],
        ),
      );

  Widget _buildDrawer() {
    final hex = selectedSector!;
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          boxShadow: [BoxShadow(color: Colors.black26, blurRadius: 16)],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: getDensityColor(hex.count).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      children: [
                        Container(width: 8, height: 8, decoration: BoxDecoration(color: getDensityColor(hex.count), shape: BoxShape.circle)),
                        const SizedBox(width: 5),
                        Text(
                          '${getDensityLabel(hex.count)}  ·  ${hex.count} image${hex.count != 1 ? 's' : ''}',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: getDensityColor(hex.count)),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  GestureDetector(
                    onTap: _closeDrawer,
                    child: const Icon(Icons.close, size: 18, color: Color(0xFF94a3b8)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // FIX (audit #15): EdgeInsetsPadding was a one-line wrapper
            // used exactly once — inlined as a plain SizedBox.
            SizedBox(
              height: 110,
              child: loading
                  ? const Center(child: CircularProgressIndicator(color: primaryBlue, strokeWidth: 2))
                  : drawerError
                      // FIX (Step 4): a failed batch request is not the same
                      // as an empty sector — show a retryable error row
                      // instead of the misleading 'No images found' text.
                      ? GestureDetector(
                          onTap: () {
                            final sector = selectedSector;
                            if (sector != null) _onHexTap(sector);
                          },
                          child: Center(
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: const [
                                Icon(Icons.wifi_off, size: 14, color: Color(0xFFb91c1c)),
                                SizedBox(width: 6),
                                Text(
                                  "Couldn't load images. Tap to retry.",
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFFb91c1c)),
                                ),
                                SizedBox(width: 6),
                                Icon(Icons.refresh, size: 14, color: Color(0xFFb91c1c)),
                              ],
                            ),
                          ),
                        )
                      : drawerImages.isEmpty
                          ? const Center(child: Text('No images found in this sector.', style: TextStyle(fontSize: 12, color: Colors.grey)))
                          : ListView.builder(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                          itemCount: drawerImages.length + (_pendingImageIds.isNotEmpty ? 1 : 0),
                          itemBuilder: (context, index) {
                            // FIX (audit #6 remediation): trailing tile fetches the next
                            // page of image_ids instead of rendering all of them up front.
                            if (index == drawerImages.length) {
                              return GestureDetector(
                                onTap: _loadMoreImages,
                                child: Container(
                                  width: 80,
                                  margin: const EdgeInsets.only(right: 8),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(10),
                                    color: const Color(0xFFf1f5f9),
                                    border: Border.all(color: const Color(0xFFe2e8f0)),
                                  ),
                                  alignment: Alignment.center,
                                  child: _loadingMoreImages
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(strokeWidth: 2, color: primaryBlue),
                                        )
                                      : Column(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(Icons.add_photo_alternate_outlined, color: primaryBlue, size: 20),
                                            const SizedBox(height: 4),
                                            Text(
                                              '+${_pendingImageIds.length}',
                                              style: const TextStyle(fontSize: 10, color: primaryBlue, fontWeight: FontWeight.bold),
                                            ),
                                          ],
                                        ),
                                ),
                              );
                            }

                            final img = drawerImages[index];
                            return GestureDetector(
                              onTap: () => _showImageDetails(img), // FIXED: Wrapped item to accept click events
                              child: Container(
                                width: 100,
                                margin: const EdgeInsets.only(right: 8),
                                decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), color: const Color(0xFFf1f5f9)),
                                clipBehavior: Clip.antiAlias,
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    // FIX (audit #6): Image.network decoded the full-res
                                    // drone frame (often several MB / 4K) into memory for a
                                    // 100px cell, with no cache bound — a common source of
                                    // OOM crashes on mid-range Android devices, plus repeated
                                    // multi-MB re-downloads on every scroll/hex tap.
                                    // CachedNetworkImage disk/mem-caches the bytes and
                                    // memCacheWidth caps the *decoded* bitmap size.
                                    // FIX (audit #6 + #2.4): now requests the
                                    // Cloudinary-transformed thumbnail (see
                                    // cloudinaryThumbUrl above) instead of the
                                    // full original file — cuts network bytes,
                                    // not just decoded memory. memCacheWidth
                                    // stays as a second safety net.
                                    CachedNetworkImage(
                                      imageUrl: cloudinaryThumbUrl(img.fileUrl),
                                      fit: BoxFit.cover,
                                      memCacheWidth: 200, // ~2x the 100px cell for retina
                                      maxWidthDiskCache: 400,
                                      placeholder: (context, url) => const Center(
                                        child: SizedBox(
                                          width: 16,
                                          height: 16,
                                          child: CircularProgressIndicator(strokeWidth: 2, color: primaryBlue),
                                        ),
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
                                          color: Colors.black.withValues(alpha: 0.5),
                                          child: Text(
                                            img.type!,
                                            style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w700),
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
