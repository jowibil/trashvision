
import 'package:TrashVision/models/report_model.dart';
import 'package:http/http.dart' as http;

class ApiService {
  final String baseUrl = "https://shopper-agent-mustard.ngrok-free.dev/reports";

  Future<bool> uploadReport(Report report) async {
    try {
      var request = http.MultipartRequest('POST', Uri.parse('$baseUrl/'));

      request.fields['waste_type'] = report.wasteType;
      request.fields['latitude'] = report.latitude.toString();
      request.fields['longitude'] = report.longitude.toString();
      request.fields['user_id'] = report.userId;
      if (report.description != null) request.fields['description'] = report.description!;

      // Add the photo
      if (report.localPhotoPath != null) {
        request.files.add(await http.MultipartFile.fromPath('photo', report.localPhotoPath!));
      }

      var response = await request.send();
      return response.statusCode == 200 || response.statusCode == 201;
    } catch (e) {
      print("Sync Upload Error: $e");
      return false;
    }
  }
}