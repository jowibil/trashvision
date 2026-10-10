/// Shared Cloudinary on-demand transform helper.
///
/// Backend uploads return raw `secure_url`s (`cloudinary_service.py` applies
/// no transform), so clients insert transforms into the URL path after
/// `/upload/` — Cloudinary renders them at request time, no backend change
/// needed. This replaces the three per-file private copies that had drifted
/// (drawer thumb, detail dialog, and a dead one in mapview.dart).
///
/// The map rule this enforces: never decode a full-res drone frame when a
/// thumbnail or capped-size preview will do (mobile OOM guard).
String cloudinaryTransformUrl(String url, String transform) {
  const marker = '/upload/';
  final idx = url.indexOf(marker);
  // Non-Cloudinary host (dev fixtures) — return untouched, never break.
  if (idx == -1) return url;
  final insertAt = idx + marker.length;
  return '${url.substring(0, insertAt)}$transform/${url.substring(insertAt)}';
}

// Presets shared by the map surfaces (sized to their render slots).
const String kCloudinaryThumbSmall = 'w_320,h_240,c_fill,q_auto,f_auto';
const String kCloudinaryThumbMedium = 'w_640,h_480,c_fill,q_auto,f_auto';
const String kCloudinaryDetailLarge = 'w_1280,c_limit,q_auto,f_auto';
