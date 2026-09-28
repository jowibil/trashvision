import 'package:geolocator/geolocator.dart';

Future<void> checkLocationServices() async {
  bool serviceEnabled;
  LocationPermission permission;

  // Check if GPS is actually turned on
  serviceEnabled = await Geolocator.isLocationServiceEnabled();
  if (!serviceEnabled) {
    // This opens the system settings for the user to turn on GPS
    await Geolocator.openLocationSettings();
    return; 
  }

  // Check Permission Status
  permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied) {
      return Future.error('Location permissions are denied');
    }
  }
  
  if (permission == LocationPermission.deniedForever) {
    await Geolocator.openAppSettings();
    return Future.error('Location permissions are permanently denied.');
  }
}