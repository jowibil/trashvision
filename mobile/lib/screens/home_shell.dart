import 'package:flutter/material.dart';

import '../widgets/bottom_nav.dart';
import 'home_screen.dart';
import 'mapview.dart';
import 'report_screen.dart';
import 'user_profile_screen.dart';

/// Signed-in root surface: Home / Map / Report / Profile.
///
/// Before this shell each tab was its own top-level route, entered with
/// `pushNamedAndRemoveUntil(..., (route) => false)`. That predicate deletes
/// every route underneath, so the back stack was exactly one deep — a back
/// swipe had nothing to pop and Android finished the activity instead of
/// returning to the previous page. Switches also rebuilt the tab, losing map
/// zoom and any in-progress report.
///
/// Here the four tabs are bodies of a single route: Home (index 0) is always
/// the root, tab state survives switching via [IndexedStack], and system back
/// returns from any tab to Home, exiting only from Home — the usual Android
/// pattern. Tabs are mounted lazily so opening the app does not start the map
/// fetch, ledger sync and camera/location probes all at once.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key, this.initialIndex = 0});

  /// 0 Home, 1 Map, 2 Report, 3 Profile.
  final int initialIndex;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  static const int _homeTab = 0;
  static const int _reportTab = 2;
  static const int _profileTab = 3;
  static const int _tabCount = 4;

  late int _currentIndex = widget.initialIndex;

  /// Highest tab ever shown; everything above it stays an empty box so its
  /// initState (network, camera, location) is deferred until first visit.
  late int _highestMountedIndex = widget.initialIndex;

  /// Photo recovered from a killed camera session (HomeScreen's
  /// retrieveLostData). ReportScreen reads `initialImagePath` once in
  /// initState, so handing it over means remounting the tab with this path as
  /// part of the key.
  String? _reportImagePath;

  /// Home and Profile are read-only dashboards that load their data once in
  /// initState. Keeping them alive forever would freeze the dashboard numbers
  /// and leave a just-submitted report missing from the Profile ledger, which
  /// the old per-visit routes refreshed. Their key carries an epoch that is
  /// bumped on entry, so they remount and re-fetch exactly as before, while
  /// Map (zoom/filters) and Report (half-written form) keep their state.
  int _homeEpoch = 0;
  int _profileEpoch = 0;

  void _refreshOnEntry(int index) {
    if (index == _homeTab) _homeEpoch++;
    if (index == _profileTab) _profileEpoch++;
  }

  void _selectTab(int index) {
    if (index == _currentIndex) return;
    setState(() {
      _currentIndex = index;
      if (index > _highestMountedIndex) _highestMountedIndex = index;
      _refreshOnEntry(index);
    });
  }

  void _openReportWithImage(String imagePath) {
    setState(() {
      _reportImagePath = imagePath;
      _currentIndex = _reportTab;
      if (_reportTab > _highestMountedIndex) _highestMountedIndex = _reportTab;
    });
  }

  void _handleReportSubmitted() {
    setState(() {
      // Drop any recovered photo so the next visit starts from a blank form.
      _reportImagePath = null;
      _currentIndex = _homeTab;
      _refreshOnEntry(_homeTab);
    });
  }

  Widget _tabBody(int index) {
    switch (index) {
      case _homeTab:
        return HomeScreen(
          key: ValueKey('home:$_homeEpoch'),
          onSelectTab: _selectTab,
          onOpenReportWithImage: _openReportWithImage,
        );
      case 1:
        return const MapView();
      case _reportTab:
        return ReportScreen(
          key: ValueKey('report:${_reportImagePath ?? ''}'),
          initialImagePath: _reportImagePath,
          onSubmitted: _handleReportSubmitted,
        );
      default:
        return UserProfileScreen(key: ValueKey('profile:$_profileEpoch'));
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Back exits only from Home; on any other tab it returns to Home
      // instead of closing the app.
      canPop: _currentIndex == _homeTab,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _selectTab(_homeTab);
      },
      child: Scaffold(
        // Each tab keeps its own Scaffold (and AppBar), so let those handle the
        // keyboard inset. Resizing here too would subtract the keyboard height
        // twice and squash the report form.
        resizeToAvoidBottomInset: false,
        body: IndexedStack(
          index: _currentIndex,
          children: [
            for (var i = 0; i < _tabCount; i++)
              i <= _highestMountedIndex
                  ? _tabBody(i)
                  : const SizedBox.shrink(),
          ],
        ),
        bottomNavigationBar: BottomNavBar(
          currentIndex: _currentIndex,
          onTabSelected: _selectTab,
        ),
      ),
    );
  }
}
