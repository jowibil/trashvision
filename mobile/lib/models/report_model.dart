class Report {
  final int? id;
  final String wasteType;
  final double latitude;
  final double longitude;
  final String userId;
  final String? areaId;
  final String? localPhotoPath;
  final String? description;
  final String? status;
  final DateTime? timestamp;

  Report({
    this.id,
    required this.wasteType,
    required this.latitude,
    required this.longitude,
    required this.userId,
    this.areaId,
    this.localPhotoPath,
    this.description,
    this.status = 'pending',
    this.timestamp,
  });

  Map<String, dynamic> toSqlMap() => {
    'id': id,
    'waste_type': wasteType,
    'latitude': latitude,
    'longitude': longitude,
    'user_id': userId,
    'area_id': areaId,
    'local_photo_path': localPhotoPath,
    'description': description,
  };

  factory Report.fromSql(Map<String, dynamic> map) {
    return Report(
      id: map['id'],
      wasteType: map['waste_type'],
      latitude: map['latitude'],
      longitude: map['longitude'],
      userId: map['user_id'],
      areaId: map['area_id'],
      localPhotoPath: map['local_photo_path'],
      description: map['description'],
    );
  }
}