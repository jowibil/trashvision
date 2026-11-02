import 'package:flutter/material.dart';

/// Lightweight Markdown renderer for model chat replies (chat_screen.dart).
///
/// The backend reply pipeline is the same Markdown strings the web widget
/// renders with react-markdown (paragraphs, **strong**, bullets, ordered
/// lists), but this app pulls in no markdown dependency — and a full
/// renderer is overkill for chat. This widget hand-rolls exactly the subset
/// the model actually emits:
///
///   **bold**  __bold__  *italic*  `code`  ## headings  - bullets  1. steps
///
/// Anything else (tables, links, images) degrades to plain text; unpaired
/// asterisks stay literal so user prose is never mangled.
class ChatMarkdownText extends StatelessWidget {
  final String text;
  final TextStyle baseStyle;

  const ChatMarkdownText({
    super.key,
    required this.text,
    required this.baseStyle,
  });

  /// Inline emphasis, tried in this order: `**bold**`, `__bold__`, `*italic*`,
  /// `` `code` ``. Bold precedes italic so `**a**` is never read as `*` +
  /// `*a* + `*`; non-greedy bodies keep multiple pairs in one line correct.
  /// Italic (like real Markdown) requires a non-space character right inside
  /// the delimiters, so prose like "2 * 3 * 4" stays literal.
  static final RegExp _inline = RegExp(
    r'\*\*(.+?)\*\*|__(.+?)__|\*(\S(?:.*?\S)?)\*|`([^`]+)`',
    dotAll: true,
  );

  /// Block patterns, matched per trimmed line.
  static final RegExp _heading = RegExp(r'^(#{1,6})\s+(.*)$');
  static final RegExp _bullet = RegExp(r'^[-•*]\s+(.*)$');
  static final RegExp _numbered = RegExp(r'^(\d+)[.)]\s+(.*)$');

  /// Inline markers to styled spans. Single nesting level: emphasis inside
  /// bold renders its inner markers literally (the model doesn't nest).
  static List<InlineSpan> inlineSpans(String source) {
    if (source.isEmpty) return const [TextSpan(text: '')];
    final spans = <InlineSpan>[];
    var cursor = 0;
    for (final match in _inline.allMatches(source)) {
      if (match.start > cursor) {
        spans.add(TextSpan(text: source.substring(cursor, match.start)));
      }
      final bold = match.group(1) ?? match.group(2);
      if (bold != null) {
        spans.add(TextSpan(
          text: bold,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ));
      } else if (match.group(3) != null) {
        spans.add(TextSpan(
          text: match.group(3),
          style: const TextStyle(fontStyle: FontStyle.italic),
        ));
      } else {
        spans.add(TextSpan(
          text: match.group(4),
          style: const TextStyle(
            fontFamily: 'monospace',
            backgroundColor: Color(0x14005D90),
          ),
        ));
      }
      cursor = match.end;
    }
    if (cursor < source.length) {
      spans.add(TextSpan(text: source.substring(cursor)));
    }
    return spans;
  }

  /// Block layout: paragraphs merge consecutive lines (markdown semantics),
  /// headings/bullets/steps get their own rows with spacing.
  List<Widget> buildBlocks() {
    final blocks = <Widget>[];
    final paragraph = <String>[];

    void flushParagraph() {
      if (paragraph.isEmpty) return;
      // Root span carries the base style so emphasis children override it
      // and unchanged children inherit it (Text.rich's style param is only
      // a render-time fallback the span tree itself can't observe).
      blocks.add(Text.rich(
        TextSpan(style: baseStyle, children: inlineSpans(paragraph.join(' '))),
        softWrap: true,
      ));
      paragraph.clear();
    }

    for (final rawLine in text.split('\n')) {
      final line = rawLine.trim();
      if (line.isEmpty) {
        flushParagraph();
        continue;
      }
      final heading = _heading.firstMatch(line);
      if (heading != null) {
        flushParagraph();
        final level = heading.group(1)!.length;
        blocks.add(Padding(
          padding: EdgeInsets.only(top: blocks.isEmpty ? 0 : 8, bottom: 2),
          child: Text.rich(
            TextSpan(
              style: baseStyle.copyWith(
                fontWeight: FontWeight.w700,
                fontSize: (baseStyle.fontSize ?? 13) + (level <= 2 ? 2.5 : 1),
              ),
              children: inlineSpans(heading.group(2)!),
            ),
          ),
        ));
        continue;
      }
      final bullet = _bullet.firstMatch(line);
      if (bullet != null) {
        flushParagraph();
        blocks.add(Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('•', style: baseStyle.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(width: 6),
              Expanded(
                child: Text.rich(
                  TextSpan(style: baseStyle, children: inlineSpans(bullet.group(1)!)),
                ),
              ),
            ],
          ),
        ));
        continue;
      }
      final numbered = _numbered.firstMatch(line);
      if (numbered != null) {
        flushParagraph();
        blocks.add(Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 22,
                child: Text(
                  '${numbered.group(1)}.',
                  style: baseStyle.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              Expanded(
                child: Text.rich(
                  TextSpan(style: baseStyle, children: inlineSpans(numbered.group(2)!)),
                ),
              ),
            ],
          ),
        ));
        continue;
      }
      paragraph.add(line);
    }
    flushParagraph();
    return blocks;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: buildBlocks(),
    );
  }
}
