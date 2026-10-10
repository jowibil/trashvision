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

  /// Symmetric with [fromJson] (same snake_case keys as the backend payload)
  /// so areas can be persisted verbatim in the offline map cache.
  Map<String, dynamic> toJson() => {
    'area_id': areaId,
    'area_name': areaName,
    'center_latitude': centerLatitude,
    'center_longitude': centerLongitude,
    'boundary': boundary,
  };
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
  /// Nullable by contract: detections may be source-frameless on the backend
  /// (detections.image_id is nullable — geotag-less/legacy rows), and the
  /// batch endpoint legitimately returns null. Parsing it as non-nullable
  /// String threw a TypeError AFTER the 200 response arrived, so the drawer
  /// showed "Couldn't load detections" for a request the server logged as
  /// OK.
  final String? imageId;
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
    imageId: json['image_id'] as String?,
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
  final int count;
  late final LatLng center;

  /// Geodesic area of the cell in m², computed server-side (spec §2.1 —
  /// NEVER a planar hex formula; clipped cells report their real area).
  /// Powers CCI = K · count / area, the size-invariant severity metric.
  final double? hexAreaM2;

  /// Clean Coast Index for this cell: K · count / hexAreaM2 with the spec's
  /// K = 20. Same classifier as the web map (useHexbins.ts classifyCci) so
  /// both platforms color identically. Null area (legacy rows) → null CCI.
  double? get cci {
    final area = hexAreaM2;
    if (area == null || area <= 0) return null;
    return count / area * 20;
  }

  /// DETECTION ids in this cell (current backend contract). The drawer's
  /// tap flow resolves these via POST /images/batch {detection_ids: [...]}. 
  final List<String> detectionIds;

  /// Legacy: IMAGE ids from pre-fix backends. Kept so the app still works
  /// against an un-updated server; the service sends whichever is present.
  final List<String> imageIds;

  HexBin({
    required this.polygon,
    required this.detectionIds,
    required this.imageIds,
    required this.count,
    this.hexAreaM2,
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
      detectionIds: json['detection_ids'] != null
          ? List<String>.from(json['detection_ids'])
          : <String>[],
      imageIds: json['image_ids'] != null
          ? List<String>.from(json['image_ids'])
          : <String>[],
      count: json['count'] as int,
      hexAreaM2: (json['hex_area_m2'] as num?)?.toDouble(),
    );
  }

  /// Symmetric with [fromJson] (raw [lng, lat] pairs, backend order) so
  /// hexbins can be persisted verbatim in the offline map cache.
  Map<String, dynamic> toJson() => {
    'polygon': polygon
        .map((p) => [p.longitude, p.latitude])
        .toList(),
    'detection_ids': detectionIds,
    'image_ids': imageIds,
    'count': count,
    'hex_area_m2': hexAreaM2,
  };
}

/// A verified community report pin for the map's community layer. Parsed
/// from GET /reports/?status=verified&area_id=... (backend/routes/reports.py
/// get_all_reports). toJson is symmetric with fromJson — the offline map
/// cache persists these verbatim (mobile_map_service.getReportPinsCached).
class ReportPin {
  final String reportId;
  final String wasteType;
  final String? photoUrl;
  final String? description;

  /// Always 'verified' today (the layer only requests verified reports),
  /// kept as a field so the model survives a future status widening.
  final String status;
  final String? timestamp;
  final double latitude;
  final double longitude;
  final String reporterName;

  ReportPin({
    required this.reportId,
    required this.wasteType,
    this.photoUrl,
    this.description,
    required this.status,
    this.timestamp,
    required this.latitude,
    required this.longitude,
    this.reporterName = 'Community Citizen',
  });

  factory ReportPin.fromJson(Map<String, dynamic> json) => ReportPin(
    reportId: json['report_id'],
    wasteType: json['waste_type'] ?? 'unknown',
    photoUrl: json['photo_url'],
    description: json['description'],
    status: json['status'] ?? 'pending',
    timestamp: json['timestamp']?.toString(),
    latitude: (json['latitude'] as num).toDouble(),
    longitude: (json['longitude'] as num).toDouble(),
    reporterName: json['reporter_name'] ?? 'Community Citizen',
  );

  Map<String, dynamic> toJson() => {
    'report_id': reportId,
    'waste_type': wasteType,
    'photo_url': photoUrl,
    'description': description,
    'status': status,
    'timestamp': timestamp,
    'latitude': latitude,
    'longitude': longitude,
    'reporter_name': reporterName,
  };
}
