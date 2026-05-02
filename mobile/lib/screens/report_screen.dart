import 'dart:io';
import 'package:TrashVision/helper/database_helper.dart';
import 'package:TrashVision/services/api_service.dart';
import 'package:TrashVision/widgets/bottom_nav.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../models/report_model.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:camera/camera.dart';
import 'camera_page.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class ReportScreen extends StatefulWidget {
  final String? initialImagePath;
  const ReportScreen({super.key, this.initialImagePath});

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  LatLng? _selectedLocation;
  bool _loadingLocation = true;
  final storage = const FlutterSecureStorage();
  final ImagePicker _picker = ImagePicker();

  String? userId;
  String? _capturedImagePath;

  String selectedWasteType = 'plastic_rigid';
  final TextEditingController _descController = TextEditingController();

  final List<String> wasteTypes = [
    'plastic_rigid',
    'plastic_film',
    'metal',
    'glass',
    'styrofoam',
    'composite_packaging',
  ];

  @override
  void initState() {
    super.initState();
    _capturedImagePath = widget.initialImagePath;
    _loadUserData();
    _getCurrentLocation();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _retrieveLostData();
    });
  }

  Future<void> _loadUserData() async {
    final currentUser = await storage.read(key: "user_id");
    if (mounted) {
      setState(() {
        userId = currentUser;
      });
    }
  }

  Future<void> _getCurrentLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        if (mounted) {
          setState(() => _loadingLocation = false);
        }
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          if (mounted) {
            setState(() => _loadingLocation = false);
          }
          return;
        }
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );

      if (mounted) {
        setState(() {
          _selectedLocation = LatLng(position.latitude, position.longitude);
          _loadingLocation = false;
        });
      }
    } catch (e) {
      debugPrint("Location error: $e");
      setState(() => _loadingLocation = false);
    }
  }

  // Future<String> _saveImagePermanently(String tempPath) async {
  //   final dir = await getApplicationDocumentsDirectory();
  //   final newPath = '${dir.path}/${DateTime.now().millisecondsSinceEpoch}.jpg';
  //   return (await File(tempPath).copy(newPath)).path;
  // }

  Future<void> _retrieveLostData() async {
    final LostDataResponse response = await _picker.retrieveLostData();

    if (response.isEmpty) return;

    if (response.file != null) {
      if (mounted) {
        setState(() {
          _capturedImagePath = response.file!.path;
        });
      }
    } else {
      debugPrint("LostData Error: ${response.exception?.code}");
    }
  }

  //   Future<void> _pickImage() async {
  //   // Request camera permission first
  //   final status = await Permission.camera.request();
  //   if (status.isDenied || status.isPermanentlyDenied) {
  //     if (!mounted) return;
  //     ScaffoldMessenger.of(context).showSnackBar(
  //       const SnackBar(
  //         content: Text("Camera permission is required to take photos."),
  //       ),
  //     );
  //     // Open app settings if permanently denied
  //     if (status.isPermanentlyDenied) openAppSettings();
  //     return;
  //   }
  //   try {
  //     final XFile? image = await _picker.pickImage(
  //       source: ImageSource.camera,
  //       imageQuality: 85,
  //     );
  //     if (image != null) {
  //       final savedPath = await _saveImagePermanently(image.path);
  //       if (!mounted) return;
  //       setState(() {
  //         _capturedImagePath = savedPath;
  //       });
  //     }
  //   } catch (e) {
  //     debugPrint("Camera Error: $e");
  //   }
  // }
  Future<void> _pickImage() async {
    final cameras = await availableCameras();
    final firstCamera = cameras.first;

    if (!mounted) return;

    // Push a full-screen camera view you control entirely
    final result = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => CameraPage(camera: firstCamera)),
    );

    if (result != null) {
      setState(() {
        _capturedImagePath = result;
      });
    }
  }

  Future<void> _submit() async {
    // Validate image
    if (_selectedLocation == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Could not get location. Enable GPS.")),
      );
      return;
    }

    if (_capturedImagePath == null ||
        !File(_capturedImagePath!).existsSync() ||
        File(_capturedImagePath!).lengthSync() == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please capture an image first")),
      );
      return;
    }

    // Validate user
    if (userId == null) {
      await _loadUserData();
      if (userId == null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Error: User ID not found. Please log in again."),
          ),
        );
        return;
      }
    }

    final newReport = Report(
      wasteType: selectedWasteType,
      latitude: _selectedLocation!.latitude,
      longitude: _selectedLocation!.longitude,
      userId: userId!,
      description: _descController.text,
      localPhotoPath: _capturedImagePath,
    );

    try {
      var connectivityResult = await Connectivity().checkConnectivity();

      if (connectivityResult.contains(ConnectivityResult.none)) {
        await DatabaseHelper.instance.insertReport(newReport);

        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Offline: Report saved to outbox")),
        );
      } else {
        await ApiService().uploadReport(newReport);

        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Report submitted successfully!")),
        );
      }

      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      debugPrint("Submit Error: $e");

      // fallback
      await DatabaseHelper.instance.insertReport(newReport);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server unreachable. Saved to outbox.")),
      );

      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFF),
      bottomNavigationBar: const BottomNavBar(currentIndex: 2),
      appBar: AppBar(
        title: const Text(
          "Submit Report",
          style: TextStyle(
            fontWeight: FontWeight.bold,
            color: Colors.white,
            letterSpacing: 0.5,
          ),
        ),
        centerTitle: true,
        elevation: 0,
        backgroundColor: const Color(0xFF005D90),
        foregroundColor: const Color.fromARGB(255, 255, 255, 255),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildPhotoCard(),
            const SizedBox(height: 25),
            const Text(
              "Waste Type",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            _buildWasteChips(),
            const SizedBox(height: 25),
            _buildLocationCard(),
            const SizedBox(height: 25),
            const Text(
              "Description",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: "Add more details about the trash...",
                fillColor: Colors.white,
                filled: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(15),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 40),
            _buildSubmitButton(),
          ],
        ),
      ),
    );
  }

  Widget _buildPhotoCard() {
    final file = _capturedImagePath != null ? File(_capturedImagePath!) : null;

    final hasValidImage =
        file != null && file.existsSync() && file.lengthSync() > 0;

    return GestureDetector(
      onTap: _pickImage,
      child: Container(
        width: double.infinity,
        height: 200,
        decoration: BoxDecoration(
          color: Colors.blue.withOpacity(0.05),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.blue.withOpacity(0.1)),
        ),
        child: hasValidImage
            ? ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Image.file(file, fit: BoxFit.cover),
              )
            : Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(LucideIcons.camera, size: 40, color: Colors.blue[300]),
                  const SizedBox(height: 8),
                  const Text(
                    "Tap to take photo",
                    style: TextStyle(
                      color: Colors.blue,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildWasteChips() {
    return Wrap(
      spacing: 6,
      children: wasteTypes.map((type) {
        bool isSelected = selectedWasteType == type;
        return ChoiceChip(
          label: Text(type.replaceAll('_', ' ').toUpperCase()),
          selected: isSelected,
          onSelected: (_) => setState(() => selectedWasteType = type),
          selectedColor: const Color(0xFF005D90),
          showCheckmark: true,
          checkmarkColor: Colors.white,
          labelStyle: TextStyle(
            color: isSelected ? Colors.white : Colors.black87,
          ),
          backgroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildLocationCard() {
    if (_loadingLocation) {
      return Container(
        height: 200,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(15),
        ),
        child: const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 10),
              Text("Getting your location..."),
            ],
          ),
        ),
      );
    }

    if (_selectedLocation == null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.red.shade50,
          borderRadius: BorderRadius.circular(15),
          border: Border.all(color: Colors.red.shade200),
        ),
        child: const Row(
          children: [
            Icon(Icons.location_off, color: Colors.red),
            SizedBox(width: 12),
            Text(
              "Could not get location.\nPlease enable GPS.",
              style: TextStyle(color: Colors.red),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          "Location",
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        const Text(
          "Tap the map to adjust the pin if needed",
          style: TextStyle(fontSize: 12, color: Colors.grey),
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(15),
          child: SizedBox(
            height: 200,
            child: FlutterMap(
              options: MapOptions(
                initialCenter: _selectedLocation!,
                initialZoom: 16,
                onTap: (tapPosition, point) {
                  // user taps to move the pin
                  setState(() {
                    _selectedLocation = point;
                  });
                },
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'com.trashvision.app',
                ),
                MarkerLayer(
                  markers: [
                    Marker(
                      point: _selectedLocation!,
                      width: 40,
                      height: 40,
                      child: const Icon(
                        Icons.location_pin,
                        color: Colors.red,
                        size: 40,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        // Show current coordinates below map
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              const Icon(Icons.my_location, size: 16, color: Colors.blue),
              const SizedBox(width: 8),
              Text(
                "Lat: ${_selectedLocation!.latitude.toStringAsFixed(5)}, "
                "Lng: ${_selectedLocation!.longitude.toStringAsFixed(5)}",
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSubmitButton() {
    return SizedBox(
      width: double.infinity,
      height: 55,
      child: ElevatedButton(
        onPressed: _submit,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF005D90),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(15),
          ),
          elevation: 5,
          shadowColor: Colors.blueAccent.withOpacity(0.3),
        ),
        child: const Text(
          "Submit Report",
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}
