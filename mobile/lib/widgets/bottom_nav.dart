import 'package:flutter/material.dart';

class BottomNavBar extends StatelessWidget {
  final int currentIndex;

  const BottomNavBar({super.key, required this.currentIndex});

  void _onItemTapped(BuildContext context, int index) {
    if (index == currentIndex) return; 
    bool clearAllHistory(Route<dynamic> route) => false;

    switch (index) {
      case 0:
        Navigator.pushNamedAndRemoveUntil(context, '/home', clearAllHistory);
        break;
      case 1:
        Navigator.pushNamedAndRemoveUntil(context, '/map', clearAllHistory);
        break;
      case 2:
        Navigator.pushNamedAndRemoveUntil(context, '/report', clearAllHistory);
        break;
      case 3:
        Navigator.pushNamedAndRemoveUntil(context, '/profile', clearAllHistory);
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return BottomNavigationBar(
      currentIndex: currentIndex,
      backgroundColor: Color.fromARGB(255,255,255,255),
      onTap: (index) => _onItemTapped(context, index),
      selectedItemColor: const Color(0xFF005D90),
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