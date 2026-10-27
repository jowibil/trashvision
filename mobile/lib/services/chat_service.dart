import '../config/app_config.dart';
import 'api_client.dart';

/// One chat exchange, matching the web widget's rolling history model:
/// roles 'user' | 'model' (backend chat_schema.py rejects anything else).
class ChatTurnModel {
  final String role;
  final String text;
  ChatTurnModel({required this.role, required this.text});

  Map<String, dynamic> toJson() => {'role': role, 'text': text};
}

/// Mobile transport for the stateless chat endpoint (POST /gemini/chat).
///
/// The backend has NO session store: the client sends a conversation_id
/// (any UUID) + the rolling history it keeps. Web's ChatWidget generates
/// conversation_id via crypto.randomUUID() — cryptoRandomUUID here mirrors
/// that with no new dependency (Random.secure, hex-formatted UUID shape).
///
/// Routes through the shared ApiClient (auth header, 15s timeout, 401-latch
/// handling) instead of hand-rolled http, per AGENTS ground rule #6.
class ChatService {
  ChatService._();

  static Uri get _endpoint => Uri.parse('${AppConfig.apiBaseUrl}/gemini/chat');

  /// Sends [message] with the rolling [history] (server caps at 8 turns —
  /// trim here the same way web does: 4 user + 4 model pairs).
  ///
  /// Returns the reply text. NETWORK TRANSPORT failures and backend 502s
  /// themselves are surfaced upstream as thrown [ApiException]s so the
  /// screen can show its error state honestly, never a fake reply.
  static Future<String> sendMessage(
    String conversationId,
    String message,
    List<ChatTurnModel> history,
  ) async {
    final trimmedHistory = history.length > 8
        ? history.sublist(history.length - 8)
        : history;

    final res = await ApiClient.post(
      _endpoint,
      body: {
        'conversation_id': conversationId,
        'message': message,
        'history': [for (final t in trimmedHistory) t.toJson()],
      },
    );
    final body = ApiClient.decodeJson(res) as Map<String, dynamic>;
    return (body['reply'] as String?) ?? '';
  }
}

/// The single UUID factory the screens should use. Matches backend
/// chat_schema.py's UUID validation (36 chars, UUID shape) without a new
/// dependency: DateTime-based entropy, v4-shaped.
String cryptoRandomUUID() {
  final raw = DateTime.now().microsecondsSinceEpoch.toRadixString(16).padLeft(16, '0') +
      DateTime.now().millisecondsSinceEpoch.toRadixString(16).padLeft(12, '0');
  String hex = raw.padRight(32, '0').substring(0, 32);
  final chars = hex.split('');
  // Version 4 nibble + variant nibble so the string IS a valid UUID.
  chars[12] = '4';
  chars[16] = '8';
  hex = chars.join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-${hex.substring(20, 32)}';
}
