class Detection {
  final String id;
  final String wasteType;
  final double confidence;
  final double lat;
  final double lng;
  final bool isManual;
  final String? imageUrl;

  Detection({
    required this.id,
    required this.wasteType,
    required this.confidence,
    required this.lat,
    required this.lng,
    required this.isManual,
    this.imageUrl,
  });

  factory Detection.fromJson(Map<String, dynamic> json) {
    return Detection(
      id: json['detection_id'],
      wasteType: json['waste_type'],
      confidence: json['confidence_score'].toDouble(),
      lat: json['latitude'].toDouble(),
      lng: json['longitude'].toDouble(),
      isManual: json['is_manual'] ?? false,
      imageUrl: json['file_url'], // From the joined Image table
    );
  }
}