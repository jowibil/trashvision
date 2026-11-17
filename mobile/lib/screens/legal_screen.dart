import "package:flutter/material.dart";
import "package:flutter/services.dart" show Clipboard, ClipboardData;
import "package:lucide_icons/lucide_icons.dart";

import "../config/legal_content.dart";
import "../config/theme.dart";

/// Renders one [LegalDocument] — the Terms of Service or the Privacy Policy.
///
/// One widget for both documents, because they differ only in content: a
/// version/effective-date header, numbered sections of plain paragraphs, a
/// contact block, and a link to the other document. Content lives in
/// `config/legal_content.dart` and is mirrored in `web/src/content/legal.ts`,
/// so no wording belongs in this file.
class LegalScreen extends StatelessWidget {
  final LegalDocument document;

  /// The sibling document, offered as a "read this too" link.
  final LegalDocument? other;
  final String? otherRoute;

  const LegalScreen({
    super.key,
    required this.document,
    this.other,
    this.otherRoute,
  });

  Future<void> _copySupportEmail(BuildContext context) async {
    await Clipboard.setData(const ClipboardData(text: supportEmail));
    if (!context.mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text("Support email copied.")));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: surfaceLight,
      appBar: AppBar(
        backgroundColor: surfaceLight,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ink,
        titleSpacing: 0,
        title: Text(
          document.title,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w900,
            color: ink,
            letterSpacing: -0.3,
          ),
        ),
      ),
      body: ListView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 36),
        children: [
          const Eyebrow("Legal"),
          const SizedBox(height: 6),
          Text(
            document.title,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w900,
              color: ink,
              letterSpacing: -0.6,
              height: 1.15,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _metaChip("Version ${document.version}"),
              _metaChip("Effective ${document.effectiveDate}"),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            document.summary,
            style: const TextStyle(
              fontSize: 12.5,
              color: inkMuted,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 4),
          const Hairline(),
          for (final section in document.sections) ...[
            const SizedBox(height: 12),
            Text(
              section.heading,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w900,
                color: ink,
                height: 1.3,
              ),
            ),
            const SizedBox(height: 6),
            for (final paragraph in section.paragraphs)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: SelectableText(
                  paragraph,
                  style: const TextStyle(
                    fontSize: 12.8,
                    color: inkStrong,
                    height: 1.55,
                  ),
                ),
              ),
          ],
          const SizedBox(height: 14),
          _buildContactCard(context),
          if (other != null && otherRoute != null) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () =>
                    Navigator.pushReplacementNamed(context, otherRoute!),
                icon: const Icon(LucideIcons.arrowRightLeft, size: 15),
                label: Text("Read the ${other!.title}"),
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
          const SizedBox(height: 16),
          Text(
            "Published by $operatingTeam. Written in plain language for a "
            "student research project — it is not legal advice.",
            style: const TextStyle(
              fontSize: 10.5,
              color: inkFaint,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _metaChip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: surfaceBody,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          color: inkMuted,
        ),
      ),
    );
  }

  Widget _buildContactCard(BuildContext context) {
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
          const Eyebrow("Contact"),
          const SizedBox(height: 8),
          const Text(
            "Questions about this document?",
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w900,
              color: ink,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            "Access, correction and deletion requests go to $operatingTeam.",
            style: const TextStyle(
              fontSize: 12.5,
              color: inkMuted,
              height: 1.5,
            ),
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
              onPressed: () => _copySupportEmail(context),
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
}
