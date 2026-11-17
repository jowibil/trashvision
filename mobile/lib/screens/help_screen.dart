import "package:flutter/material.dart";
import "package:flutter/services.dart" show Clipboard, ClipboardData;
import "package:lucide_icons/lucide_icons.dart";

import "../config/help_content.dart";
import "../config/legal_content.dart";
import "../config/theme.dart";

/// Help & Services hub — FAQ search + topics, a contact block, and the two
/// legal documents.
///
/// Deliberately separate from /info ("How it works"): that page documents the
/// detection maths for people checking the numbers, this one answers "how do I
/// use this app" and carries the terms. Pushed above the shell (like /info), so
/// back returns to whichever tab opened it.
///
/// Everything is local — the FAQ, the support address and both documents ship
/// in the bundle, so Help works offline, which is when people need it most.
class HelpScreen extends StatefulWidget {
  const HelpScreen({super.key});

  @override
  State<HelpScreen> createState() => _HelpScreenState();
}

class _HelpScreenState extends State<HelpScreen> {
  static const int _allTopics = -1;

  final TextEditingController _search = TextEditingController();
  String _query = "";
  int _topic = _allTopics;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  /// Topics to render: the selected chip (or all), narrowed by the search.
  /// Empty topics drop out, so a search never leaves a bare heading behind.
  List<FaqTopic> get _visibleTopics {
    final selected = _topic == _allTopics ? faqTopics : [faqTopics[_topic]];
    final query = _query.trim();
    if (query.isEmpty) return selected;

    final matched = searchFaqs(query).toSet();
    return [
      for (final topic in selected)
        if (topic.items.any((item) => matched.contains((topic, item))))
          FaqTopic(topic.title, topic.icon, [
            for (final item in topic.items)
              if (matched.contains((topic, item))) item,
          ]),
    ];
  }

  Future<void> _copySupportEmail() async {
    await Clipboard.setData(const ClipboardData(text: supportEmail));
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text("Support email copied.")));
  }

  @override
  Widget build(BuildContext context) {
    final topics = _visibleTopics;
    final searching = _query.trim().isNotEmpty;
    final visibleCount = topics.fold<int>(
      0,
      (total, topic) => total + topic.items.length,
    );

    return Scaffold(
      backgroundColor: surfaceLight,
      appBar: AppBar(
        backgroundColor: surfaceLight,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ink,
        titleSpacing: 0,
        title: const Text(
          "Help & Services",
          style: TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w900,
            color: ink,
            letterSpacing: -0.3,
          ),
        ),
      ),
      body: ListView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          const Eyebrow("Support"),
          const SizedBox(height: 6),
          const Text(
            "Help & Services",
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w900,
              color: ink,
              letterSpacing: -0.6,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            "$faqQuestionCount answers about reporting, offline syncing, guest "
            "mode and the map — plus the terms that govern the app.",
            style: const TextStyle(
              fontSize: 12.5,
              color: inkMuted,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 18),
          _buildSearchField(),
          const SizedBox(height: 12),
          _buildTopicChips(),
          const SizedBox(height: 18),
          if (topics.isEmpty)
            _buildEmptyState()
          else
            for (final topic in topics) ...[
              _buildTopicHeader(topic),
              const SizedBox(height: 8),
              for (final item in topic.items) ...[
                _FaqCard(item: item),
                const SizedBox(height: 8),
              ],
              const SizedBox(height: 8),
            ],
          if (searching && topics.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 2, bottom: 4),
              child: Text(
                "$visibleCount ${visibleCount == 1 ? "answer" : "answers"} for "
                "“${_query.trim()}”",
                style: const TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  color: inkFaint,
                ),
              ),
            ),
          const SizedBox(height: 12),
          _buildContactCard(),
          const SizedBox(height: 14),
          _buildLegalCard(),
          const SizedBox(height: 16),
          Center(
            child: Text(
              "Terms v${termsOfService.version} · effective "
              "${termsOfService.effectiveDate}",
              style: const TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                color: inkFaint,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ─── Search + topics ──────────────────────────────────────────────────────

  Widget _buildSearchField() {
    return TextField(
      controller: _search,
      onChanged: (value) => setState(() => _query = value),
      textInputAction: TextInputAction.search,
      style: const TextStyle(
        fontSize: 13,
        color: ink,
        fontWeight: FontWeight.w600,
      ),
      decoration: InputDecoration(
        hintText: "Search help",
        hintStyle: const TextStyle(fontSize: 13, color: inkFaint),
        prefixIcon: const Icon(LucideIcons.search, size: 17, color: inkMuted),
        suffixIcon: _query.isEmpty
            ? null
            : IconButton(
                onPressed: () {
                  _search.clear();
                  setState(() => _query = "");
                },
                icon: const Icon(LucideIcons.x, size: 16, color: inkMuted),
                tooltip: "Clear search",
              ),
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: surfaceBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: surfaceBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: primaryBlue, width: 1.4),
        ),
      ),
    );
  }

  Widget _buildTopicChips() {
    Widget chip(int index, String label) {
      final selected = _topic == index;
      return GestureDetector(
        onTap: () => setState(() => _topic = index),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
          decoration: BoxDecoration(
            color: selected ? primaryBlue : Colors.white,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected ? primaryBlue : surfaceBorder,
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: selected ? Colors.white : inkMuted,
            ),
          ),
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      child: Row(
        children: [
          chip(_allTopics, "All"),
          for (var i = 0; i < faqTopics.length; i++) ...[
            const SizedBox(width: 8),
            chip(i, faqTopics[i].title),
          ],
        ],
      ),
    );
  }

  Widget _buildTopicHeader(FaqTopic topic) {
    return Padding(
      padding: const EdgeInsets.only(left: 2, top: 4),
      child: Row(
        children: [
          Icon(topic.icon, size: 14, color: primaryBlue),
          const SizedBox(width: 7),
          Text(
            topic.title.toUpperCase(),
            style: const TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w900,
              color: inkFaint,
              letterSpacing: 1.1,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 22),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: surfaceBorder),
      ),
      child: Column(
        children: [
          const Icon(LucideIcons.search, size: 20, color: inkFaint),
          const SizedBox(height: 8),
          Text(
            "No answers for “${_query.trim()}”.",
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: ink,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            "Try fewer words, or write to the team below.",
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11.5, color: inkMuted),
          ),
        ],
      ),
    );
  }

  // ─── Contact + legal ──────────────────────────────────────────────────────

  Widget _buildContactCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: surfaceBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Eyebrow("Still stuck?"),
          const SizedBox(height: 8),
          const Text(
            "Write to the team",
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w900,
              color: ink,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            "Report problems, account questions and data requests go to the "
            "research team. Copy the address and send it from your mail app.",
            style: TextStyle(fontSize: 12.5, color: inkMuted, height: 1.5),
          ),
          const SizedBox(height: 10),
          SelectableText(
            supportEmail,
            style: const TextStyle(
              fontFamily: "monospace",
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: primaryBlue,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _copySupportEmail,
              icon: const Icon(LucideIcons.copy, size: 15),
              label: const Text("Copy email address"),
              style: OutlinedButton.styleFrom(
                foregroundColor: primaryBlue,
                side: BorderSide(color: primaryBlue.withValues(alpha: 0.35)),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                textStyle: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLegalCard() {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: surfaceBorder),
      ),
      child: Column(
        children: [
          _legalRow(
            LucideIcons.fileText,
            "Terms of Service",
            "The rules for using TrashVision",
            "/legal/terms",
          ),
          const Divider(height: 1, thickness: 1, color: surfaceBorder),
          _legalRow(
            LucideIcons.shieldCheck,
            "Privacy Policy",
            "What we collect, and how to reach us",
            "/legal/privacy",
          ),
        ],
      ),
    );
  }

  Widget _legalRow(
    IconData icon,
    String title,
    String subtitle,
    String route,
  ) {
    return InkWell(
      onTap: () => Navigator.pushNamed(context, route),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 17, color: primaryBlue),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w900,
                      color: ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 11.5, color: inkMuted),
                  ),
                ],
              ),
            ),
            const Icon(LucideIcons.chevronRight, size: 16, color: inkFaint),
          ],
        ),
      ),
    );
  }
}

/// One question, collapsed to its headline and expanded in place. Answers are
/// short enough to read inline, so there is no third navigation level.
class _FaqCard extends StatelessWidget {
  final FaqItem item;

  const _FaqCard({required this.item});

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: surfaceBorder),
      ),
      child: Theme(
        // The default ExpansionTile draws its own dividers and splash tint,
        // which fight the card's hairline border.
        data: Theme.of(context).copyWith(
          dividerColor: Colors.transparent,
          splashColor: Colors.transparent,
          highlightColor: Colors.transparent,
        ),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          iconColor: primaryBlue,
          collapsedIconColor: inkFaint,
          backgroundColor: Colors.transparent,
          collapsedBackgroundColor: Colors.transparent,
          shape: const Border(),
          collapsedShape: const Border(),
          title: Text(
            item.question,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: ink,
              height: 1.3,
            ),
          ),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                item.answer,
                style: const TextStyle(
                  fontSize: 12.5,
                  color: inkStrong,
                  height: 1.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
