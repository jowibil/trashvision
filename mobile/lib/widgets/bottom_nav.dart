import 'package:flutter/material.dart';

import '../config/theme.dart';

/// Shared bottom tab bar.
///
/// Tapping a tab is reported to the owner (HomeShell) instead of being pushed
/// as a route. The previous implementation called
/// `pushNamedAndRemoveUntil(context, route, (route) => false)` on every tap,
/// which deleted the route beneath and left a back stack exactly one deep: the
/// system back gesture then had nothing to pop, so Android finished the
/// activity (the app appeared to close) and each switch rebuilt the tab from
/// scratch, dropping map zoom, filters and a half-written report.
class BottomNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTabSelected;

  const BottomNavBar({
    super.key,
    required this.currentIndex,
    required this.onTabSelected,
  });

  @override
  Widget build(BuildContext context) {
    return BottomNavigationBar(
      currentIndex: currentIndex,
      backgroundColor: Color.fromARGB(255,255,255,255),
      onTap: (index) {
        if (index == currentIndex) return;
        onTabSelected(index);
      },
      selectedItemColor: primaryBlue,
      unselectedItemColor: Colors.grey,
      type: BottomNavigationBarType.fixed,
      items: const [
        BottomNavigationBarItem(icon: Icon(Icons.home), label: "Home"),
        BottomNavigationBarItem(icon: Icon(Icons.map), label: "Map"),
        BottomNavigationBarItem(icon: Icon(Icons.report), label: "Report"),
        BottomNavigationBarItem(icon: Icon(Icons.person), label: "Profile"),
      ],
    );
  }
}