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
// import 'package:path_provider/path_provider.dart';
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
  List<CameraDescription> _cameras = [];
  LatLng? _selectedLocation;
  bool _loadingLocation = true;
  final storage = const FlutterSecureStorage();
  final ImagePicker _picker = ImagePicker();

  String? userId;
  String? _capturedImagePath;

  String selectedWasteType = 'plastic';

  final TextEditingController _descController = TextEditingController();

  final List<String> wasteTypes = [
    'plastic',
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
    _initCameras();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _retrieveLostData();
    });
  }
  Future<void> _initCameras() async {
    try {
      final cameras = await availableCameras();
      if (mounted) {
        setState(() {
          _cameras = cameras;
        });
      }
    } catch (e) {
      debugPrint("Camera prefetch error: $e");
    }
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

  // Dual photo pipeline: opens a bottom choice selection panel sheet framework 
Future<void> _pickImage() async {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (BuildContext context) {
        return SafeArea(
          child: Wrap(
            children: [
              ListTile(
                leading: const Icon(LucideIcons.camera, color: Color(0xFF005D90)),
                title: const Text('Use Hardware Scanner (Camera)', style: TextStyle(fontWeight: FontWeight.bold)),
                onTap: () async {
                  // Dismiss sheet first. FIX (Step 7): the builder's `context`
                  // shadows the State's — after this pop it's defunct. Use the
                  // State's own context for everything below; guard it with
                  // its own .mounted so each async gap protects the exact
                  // context subsequently used (satisfies
                  // use_build_context_synchronously).
                  final stateContext = this.context;
                  Navigator.of(context).pop();

                  // If cameras weren't fetched yet, try fetching once more
                  if (_cameras.isEmpty) {
                    _cameras = await availableCameras();
                  }

                  if (!stateContext.mounted) return;

                  if (_cameras.isNotEmpty) {
                    // Small micro-delay ensures sheet popping animation settles completely
                    await Future.delayed(const Duration(milliseconds: 150));
                    if (!stateContext.mounted) return;

                    final result = await Navigator.push<String>(
                      stateContext,
                      MaterialPageRoute(
                        builder: (_) => CameraPage(camera: _cameras.first),
                      ),
                    );

                    if (result != null && stateContext.mounted) {
                      setState(() {
                        _capturedImagePath = result;
                      });
                    }
                  } else {
                    ScaffoldMessenger.of(stateContext).showSnackBar(
                      const SnackBar(content: Text("No functional camera hardware detected.")),
                    );
                  }
                },
              ),
              ListTile(
                leading: const Icon(LucideIcons.image, color: Color(0xFF005D90)),
                title: const Text('Upload from Storage Library (Gallery)', style: TextStyle(fontWeight: FontWeight.bold)),
                onTap: () async {
                  Navigator.of(context).pop();
                  try {
                    final XFile? pickedFile = await _picker.pickImage(
                      source: ImageSource.gallery,
                      imageQuality: 85,
                    );
                    if (pickedFile != null && mounted) {
                      setState(() {
                        _capturedImagePath = pickedFile.path;
                      });
                    }
                  } catch (e) {
                    debugPrint("Gallery Selection Error: $e");
                  }
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _submit() async {
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
        const SnackBar(content: Text("Please capture or select an image first")),
      );
      return;
    }

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
        // uploadReport returns the HTTP status (0 = network error).
        final status = await ApiService().uploadReport(newReport);

        if (!mounted) return;

        if (status == 200 || status == 201) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Report submitted successfully!")),
          );
        } else if (status == 401) {
          // Session expired mid-submit: the global ApiClient hook has already
          // redirected to /login with a snackbar. Queue the report so sync
          // picks it up after re-login — and do NOT navigate here, the
          // redirect already replaced the stack.
          await DatabaseHelper.instance.insertReport(newReport);
          return;
        } else {
          // FIX: any other non-2xx (server 500, validation 4xx, 0 = dropped
          // connection) used to be greeted with "Report submitted
          // successfully!" while the report was silently lost — it was never
          // uploaded AND never queued. Route it to the outbox instead so
          // SyncService retries it when connectivity allows, matching the
          // offline contract ("Server unreachable. Saved to outbox.").
          await DatabaseHelper.instance.insertReport(newReport);
          if (!mounted) return; // re-guard: insertReport is an async gap
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Server unreachable. Saved to outbox.")),
          );
        }
      }

      if (!mounted) return;
      // FIX: this screen is a root tab route (reached via
      // pushNamedAndRemoveUntil from BottomNavBar), so it usually has nothing
      // beneath it on the stack. Calling pop() here could black-screen the
      // app or exit it entirely instead of just returning to Home.
      Navigator.pushReplacementNamed(context, '/home');
    } catch (e) {
      debugPrint("Submit Error: $e");

      await DatabaseHelper.instance.insertReport(newReport);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server unreachable. Saved to outbox.")),
      );

      Navigator.pushReplacementNamed(context, '/home');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white, // Kept completely white
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
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildPhotoCard(),
            const SizedBox(height: 25),
            const Text(
              "Select Waste Classification Type",
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.grey),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: selectedWasteType,
              decoration: InputDecoration(
                filled: true,
                fillColor: Colors.grey[100],
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
              items: wasteTypes.map((String type) {
                return DropdownMenuItem<String>(
                  value: type,
                  child: Text(
                    type.replaceAll('_', ' ').toUpperCase(),
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                );
              }).toList(),
              onChanged: (String? newValue) {
                if (newValue != null) {
                  setState(() {
                    selectedWasteType = newValue;
                  });
                }
              },
            ),
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
                fillColor: Colors.grey[50],
                filled: true,
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(15),
                  borderSide: BorderSide(color: Colors.grey[200]!),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(15),
                  borderSide: const BorderSide(color: Color(0xFF005D90), width: 1.5),
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
    final hasValidImage = file != null && file.existsSync() && file.lengthSync() > 0;

    return GestureDetector(
      onTap: _pickImage,
      child: Container(
        width: double.infinity,
        height: 200,
        decoration: BoxDecoration(
          color: Colors.blue.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.blue.withValues(alpha: 0.1)),
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
                    "Tap to take photo or select image",
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

  Widget _buildLocationCard() {
    if (_loadingLocation) {
      return Container(
        height: 200,
        decoration: BoxDecoration(
          color: Colors.grey[50],
          borderRadius: BorderRadius.circular(15),
          border: Border.all(color: Colors.grey[200]!),
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
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.grey[50],
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.grey[200]!),
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
          shadowColor: Colors.blueAccent.withValues(alpha: 0.3),
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