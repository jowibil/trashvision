class Report {
  final int? id;
  final String? reportId; 
  final String wasteType;
  final double latitude;
  final double longitude;
  final String userId;
  final String? areaId;
  final String? localPhotoPath;
  final String? photoUrl;
  final String description;
  final DateTime? createdAt;
  final String? status;

  Report({
    this.id,
    this.reportId,
    required this.wasteType,
    required this.latitude,
    required this.longitude,
    required this.userId,
    this.areaId,
    this.localPhotoPath,
    this.photoUrl,
    required this.description,
    this.createdAt,
    this.status,
  });

  /// --- EXISTING SQL CODES ---
  Map<String, dynamic> toSqlMap() {
    return {
      if (id != null) 'id': id,
      'waste_type': wasteType,
      'latitude': latitude,
      'longitude': longitude,
      'user_id': userId,
      'area_id': areaId,
      'local_photo_path': localPhotoPath,
      'description': description,
    };
  }

  factory Report.fromSql(Map<String, dynamic> map) {
    return Report(
      id: map['id'] as int?,
      wasteType: map['waste_type'] as String,
      latitude: map['latitude'] as double,
      longitude: map['longitude'] as double,
      userId: map['user_id'] as String,
      areaId: map['area_id'] as String?,
      localPhotoPath: map['local_photo_path'] as String?,
      description: map['description'] as String? ?? '',
      createdAt: map['created_at'] != null ? DateTime.tryParse(map['created_at'] as String) : null,
    );
  }

  factory Report.fromJson(Map<String, dynamic> json) {
    return Report(
      reportId: json['report_id'] as String?, 
      wasteType: json['waste_type'] as String? ?? 'UNKNOWN',
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      userId: json['user_id'] as String? ?? '',
      areaId: json['area_id'] as String?,
      photoUrl: json['photo_url'] as String?, 
      localPhotoPath: json['local_photo_path'] as String?, 
      description: json['description'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at'] as String) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'report_id': reportId,
      'waste_type': wasteType,
      'latitude': latitude,
      'longitude': longitude,
      'user_id': userId,
      'area_id': areaId,
      'photo_url': photoUrl,
      'description': description,
      'status': status,
    };
  }
}