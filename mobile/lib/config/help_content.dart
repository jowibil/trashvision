import "package:flutter/material.dart";

/// FAQ content for Help & Services (/help) — the "how do I use this app"
/// answers, deliberately separate from the methodology page (/info), which
/// explains how detection, de-duplication and the CCI work.
///
/// Every answer below describes behaviour that exists in the app today
/// (offline outbox → `sync_services.dart`, guest adoption →
/// `database_helper.adoptGuestReports`, password reset codes → `email_service`,
/// CCI bands → `theme.dart`). If a flow changes, change the answer with it:
/// a help page that promises something the app does not do is worse than none.

/// One question/answer pair. [keywords] exist only to widen search — users
/// type "wifi", "send", "location", not the wording used in the question.
class FaqItem {
  final String question;
  final String answer;
  final List<String> keywords;

  const FaqItem(this.question, this.answer, {this.keywords = const []});
}

/// A group of related questions, shown as its own chip in the hub.
class FaqTopic {
  final String title;
  final IconData icon;
  final List<FaqItem> items;

  const FaqTopic(this.title, this.icon, this.items);
}

const List<FaqTopic> faqTopics = [
  FaqTopic("Reporting", Icons.report_problem_outlined, [
    FaqItem(
      "How do I file a report?",
      "Open the Report tab (or Home → File Report), take or choose a photo of "
          "the waste, let the app read your location, add a short description "
          "if you can, and submit. The photo and the location are required — "
          "the report has nowhere to go without them.",
      keywords: ["submit", "file", "photo", "capture", "new"],
    ),
    FaqItem(
      "Why does the app need my location?",
      "A report is a place as much as a photo: the coordinates are what put it "
          "on the map and let an administrator find the spot. The app takes "
          "them from your device's GPS while you are on the report screen. If "
          "location is off you will see a red prompt instead of a map preview, "
          "and submission waits for a fix.",
      keywords: ["gps", "permission", "map", "location", "latitude"],
    ),
    FaqItem(
      "What happens after I submit?",
      "The report is saved on your phone first, then uploaded when a "
          "connection is available. An administrator reviews it, and a verified "
          "report has its photo run through the detection model. Verification "
          "is manual, so it can take a while.",
      keywords: ["review", "admin", "verify", "status", "after"],
    ),
    FaqItem(
      "Why does my report say “Unclassified”?",
      "Because nothing has classified it yet. The waste type is assigned when "
          "an administrator verifies the report and the model labels the photo — "
          "until then the placeholder is honest, not an error.",
      keywords: ["waste type", "label", "category", "unclassified"],
    ),
    FaqItem(
      "Should I report the same spot twice?",
      "No. Duplicate reports cost review time without adding information. File "
          "a new one only when the situation changed — more waste, a different "
          "kind, or a different spot.",
      keywords: ["duplicate", "twice", "again", "same"],
    ),
  ]),
  FaqTopic("Offline & sync", Icons.cloud_off_outlined, [
    FaqItem(
      "Does the app work without a connection?",
      "Yes. A report filed offline is saved to the on-device outbox and uploads "
          "by itself when the connection returns. The map and the dashboard "
          "show their last saved figures marked “Cached” instead of pretending "
          "to be live.",
      keywords: ["offline", "wifi", "internet", "connection", "data"],
    ),
    FaqItem(
      "What does “Pending sync” mean?",
      "That the report still exists only on this phone. It has not reached the "
          "server, so no administrator can see it yet and it cannot appear in "
          "any count.",
      keywords: ["pending", "queue", "outbox", "sync"],
    ),
    FaqItem(
      "How do I know when a report has uploaded?",
      "The chip on the report card in your Profile changes from “Pending sync” "
          "to “Synced”. Pull down on the ledger to force a refresh; the app also "
          "retries automatically when the connection comes back.",
      keywords: ["upload", "synced", "sent", "refresh", "pending"],
    ),
    FaqItem(
      "Can I delete a report?",
      "Only one that has not uploaded yet — swipe its card left in your Profile. "
          "Once a report reaches the server it cannot be deleted from the app, "
          "because it has entered the review and counting record; write to the "
          "support address and ask for it to be removed.",
      keywords: ["delete", "remove", "cancel", "swipe", "erase"],
    ),
    FaqItem(
      "Why did my report fail to upload?",
      "Usually one of three things: there is no usable connection, the session "
          "expired (sign in again and the queued report uploads), or the same "
          "photo was already sent. Nothing is lost in the first two cases — the "
          "report stays in the outbox until it succeeds.",
      keywords: ["failed", "error", "stuck", "not uploading", "login"],
    ),
  ]),
  FaqTopic("Signed out & guest", Icons.person_off_outlined, [
    FaqItem(
      "Why am I on the guest screen?",
      "Either your session ended — it expired or the app was signed out — or "
          "you tapped \"Continue as guest\" on the login screen. You can report "
          "trash straight away, or sign in. Guest mode exists so a missing or "
          "expired session never blocks a report.",
      keywords: [
        "guest",
        "session",
        "expired",
        "signed out",
        "login",
        "continue as guest",
      ],
    ),
    FaqItem(
      "Where does a guest report go?",
      "It is saved on the phone with a placeholder owner, and it uploads to the "
          "account that signs in next on this device.",
      keywords: ["guest", "anonymous", "sync", "later"],
    ),
    FaqItem(
      "This phone is shared. Whose account gets my report?",
      "The first account that signs in on this phone after the report was "
          "queued. If you are not sure that will be you, sign in with your own "
          "account before reporting.",
      keywords: ["shared", "device", "phone", "account", "wrong"],
    ),
  ]),
  FaqTopic("Map & colors", Icons.map_outlined, [
    FaqItem(
      "What do the hexagon colors mean?",
      "Clean Coast Index (CCI): how much waste a cell holds for its area. "
          "≤2 very clean, ≤5 clean, ≤10 moderate, ≤20 dirty, above 20 "
          "extremely dirty. Because it divides by the cell's real area, a big "
          "sparse hex and a small packed one with the same density get the same "
          "color. The How It Works page has the full derivation.",
      keywords: ["hex", "colour", "color", "legend", "cci", "severity"],
    ),
    FaqItem(
      "Why is an area “Very low” when it has thousands of detections?",
      "Because CCI is density, not a tally. Thousands of items spread across a "
          "whole surveyed area still divide down to a low number; only tightly "
          "packed cells climb the color scale. The count itself is shown beside "
          "the color for cleanup planning.",
      keywords: ["low", "thousands", "count", "density", "why"],
    ),
    FaqItem(
      "Why isn't my report a dot on the map?",
      "The colored hexagons count drone survey detections, not community "
          "reports. Verified reports appear as their own pins and help "
          "administrators decide where to survey next, but they are not mixed "
          "into the hex counts.",
      keywords: ["pin", "dot", "missing", "report", "map"],
    ),
    FaqItem(
      "What does the month selector change?",
      "Which survey window the map counts. Each month is counted on its own, "
          "with an optional week cutoff, and “accumulated” runs from the start "
          "of the year to the end of the selected month. Pins and hexagons "
          "always use the same window.",
      keywords: ["month", "week", "window", "accumulated", "date"],
    ),
  ]),
  FaqTopic("Account", Icons.manage_accounts_outlined, [
    FaqItem(
      "How do I reset my password?",
      "On the login screen choose “Forgot password”, enter your email, and use "
          "the 6-digit code that arrives by email. The code expires after 10 "
          "minutes; request a new one if it does.",
      keywords: ["password", "forgot", "reset", "code", "email"],
    ),
    FaqItem(
      "Can I change my name or email in the app?",
      "Not yet — there is no profile-editing screen. Write to the support "
          "address from your registered email and the team will update it for "
          "you.",
      keywords: ["name", "email", "change", "edit", "profile"],
    ),
    FaqItem(
      "What happens to my reports if I sign out?",
      "Uploaded reports stay on your record. Queued reports stay on the phone "
          "and upload when you sign back in to the same account.",
      keywords: ["sign out", "logout", "leave", "pending"],
    ),
  ]),
  FaqTopic("Accuracy & limits", Icons.science_outlined, [
    FaqItem(
      "What can the model detect?",
      "Five classes of shoreline waste — plastic, styrofoam and similar "
          "categories; the exact list is on the How It Works page, served "
          "straight from the training data. Anything outside those classes is "
          "not counted.",
      keywords: ["class", "detect", "model", "yolo", "what"],
    ),
    FaqItem(
      "Why might one item be counted twice?",
      "Photos without GPS cannot be matched against each other, so the same "
          "bottle photographed from two positions can survive de-duplication as "
          "two detections. Photos with a location fix are merged by distance and "
          "overlap before counting.",
      keywords: ["double", "duplicate", "twice", "counted", "dedup"],
    ),
    FaqItem(
      "Do counts go down after a cleanup?",
      "No. An area's count is the all-time de-duplicated total, and nothing "
          "resets it automatically — a swept beach keeps its index until the "
          "underlying detection rows are removed. Plan cleanups with the count, "
          "not with the hope that the color will fade.",
      keywords: ["cleanup", "sweep", "reset", "decrease", "lower"],
    ),
    FaqItem(
      "Is this official government data?",
      "No. TrashVision is a student research project and a decision-support "
          "tool. The City Government of Panabo does not publish these figures, "
          "and they should be checked before being used for anything official.",
      keywords: ["official", "government", "lgu", "legal", "data"],
    ),
  ]),
];

/// Case-insensitive search across question, answer, keywords and topic name.
///
/// Every whitespace-separated token (2+ characters) must appear somewhere, so
/// "report offline" narrows instead of widening. An empty or all-punctuation
/// query returns nothing — the hub shows its browsable topics instead.
List<(FaqTopic, FaqItem)> searchFaqs(String query) {
  final tokens = query
      .toLowerCase()
      .split(RegExp(r"[^a-z0-9]+"))
      .where((token) => token.length > 1)
      .toList();
  if (tokens.isEmpty) return const [];

  final matches = <(FaqTopic, FaqItem)>[];
  for (final topic in faqTopics) {
    for (final item in topic.items) {
      final haystack =
          "${topic.title} ${item.question} ${item.answer} "
                  "${item.keywords.join(" ")}"
              .toLowerCase();
      if (tokens.every(haystack.contains)) matches.add((topic, item));
    }
  }
  return matches;
}

/// Question count, shown on the hub header so the screen says how much is
/// inside before you scroll.
int get faqQuestionCount =>
    faqTopics.fold(0, (total, topic) => total + topic.items.length);
