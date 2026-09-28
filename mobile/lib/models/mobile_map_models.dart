import 'package:latlong2/latlong.dart';

/// Models for the mobile map feature. Parsed shapes mirror the backend
/// payloads from `/mobile/map/areas`, `/mobile/map/areas/{id}/tiles`, and
/// `/mobile/map/images/batch` (see backend/services/mobile_service.py).
class AreaModel {
  final String areaId;
  final String areaName;
  final double centerLatitude;
  final double centerLongitude;
  final Map<String, dynamic>? boundary;

  AreaModel({
    required this.areaId,
    required this.areaName,
    required this.centerLatitude,
    required this.centerLongitude,
    this.boundary,
  });

  factory AreaModel.fromJson(Map<String, dynamic> json) => AreaModel(
    areaId: json['area_id'],
    areaName: json['area_name'],
    centerLatitude: (json['center_latitude'] as num).toDouble(),
    centerLongitude: (json['center_longitude'] as num).toDouble(),
    boundary: json['boundary'],
  );
}

class ImageDetection {
  final String label;
  final double confidence;
  final List<double> box2d; // Expects absolute database coordinates: [x1, y1, x2, y2]

  ImageDetection({
    required this.label,
    required this.confidence,
    required this.box2d,
  });

  factory ImageDetection.fromJson(Map<String, dynamic> json) => ImageDetection(
    label: json['label'] ?? 'Trash',
    confidence: (json['confidence'] as num).toDouble(),
    box2d: List<double>.from((json['box_2d'] as List<dynamic>).map((e) => (e as num).toDouble())),
  );
}

class DroneImage {
  final String imageId;
  final String fileUrl;
  final double latitude;
  final double longitude;
  final String? capturedAt;
  final String? flightDate;
  final String? type;
  final List<ImageDetection> detections;

  /// Original-frame pixel dimensions from the backend (null on legacy rows).
  /// Lets the detail dialog scale bounding boxes without decoding the
  /// full-res image — the main mobile OOM guard for this screen.
  final int? imageWidth;
  final int? imageHeight;

  DroneImage({
    required this.imageId,
    required this.fileUrl,
    required this.latitude,
    required this.longitude,
    this.capturedAt,
    this.flightDate,
    this.type,
    required this.detections,
    this.imageWidth,
    this.imageHeight,
  });

  factory DroneImage.fromJson(Map<String, dynamic> json) => DroneImage(
    imageId: json['image_id'],
    fileUrl: json['file_url'],
    latitude: (json['latitude'] as num).toDouble(),
    longitude: (json['longitude'] as num).toDouble(),
    capturedAt: json['captured_at'],
    flightDate: json['flight_date'],
    type: json['type'],
    detections: json['detections'] != null
        ? (json['detections'] as List).map((e) => ImageDetection.fromJson(e)).toList()
        : [],
    imageWidth: (json['image_width'] as num?)?.toInt(),
    imageHeight: (json['image_height'] as num?)?.toInt(),
  );
}

class HexBin {
  final List<LatLng> polygon;
  final List<String> imageIds;
  final int count;
  late final LatLng center;

  HexBin({
    required this.polygon,
    required this.imageIds,
    required this.count,
  }) {
    double sumLat = 0;
    double sumLng = 0;
    for (var point in polygon) {
      sumLat += point.latitude;
      sumLng += point.longitude;
    }
    center = LatLng(sumLat / polygon.length, sumLng / polygon.length);
  }

  factory HexBin.fromJson(Map<String, dynamic> json) {
    var rawCoords = json['polygon'] as List<dynamic>;
    List<LatLng> points = rawCoords.map((coord) {
      return LatLng(
        (coord[1] as num).toDouble(),
        (coord[0] as num).toDouble(),
      );
    }).toList();

    return HexBin(
      polygon: points,
      imageIds: List<String>.from(json['image_ids']),
      count: json['count'] as int,
    );
  }
}
