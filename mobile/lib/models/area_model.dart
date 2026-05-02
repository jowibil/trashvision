class Area {
  final String id;
  final String name;
  final String? description;
  final String? boundaryCoordinates;
  final double? centerLat;
  final double? centerLng;

  Area({
    required this.id,
    required this.name,
    this.description,
    this.boundaryCoordinates,
    this.centerLat,
    this.centerLng,
  });

  factory Area.fromJson(Map<String, dynamic> json) {
    return Area(
      id: json['area_id'],
      name: json['area_name'],
      description: json['description'],
      boundaryCoordinates: json['boundary_coordinates'],
      centerLat: json['center_latitude']?.toDouble(),
      centerLng: json['center_longitude']?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() => {
    'area_id': id,
    'area_name': name,
    'description': description,
    'boundary_coordinates': boundaryCoordinates,
    'center_latitude': centerLat,
    'center_longitude': centerLng,
  };
}