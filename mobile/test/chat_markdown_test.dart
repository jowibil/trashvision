import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:TrashVision/widgets/chat_markdown.dart';

TextStyle _base() => const TextStyle(fontSize: 13, color: Colors.black);

void main() {
  group('ChatMarkdownText.inlineSpans', () {
    test('renders **bold** as a weight-600 span', () {
      final spans = ChatMarkdownText.inlineSpans('use **bold** please')
          .whereType<TextSpan>()
          .toList();
      final bold = spans.firstWhere(
        (s) => s.style?.fontWeight == FontWeight.w600,
      );
      expect(bold.text, 'bold');
    });

    test('renders __bold__ and *italic*', () {
      final spans =
          ChatMarkdownText.inlineSpans('__b__ and *i*').whereType<TextSpan>();
      expect(
        spans.any((s) => s.style?.fontWeight == FontWeight.w600 && s.text == 'b'),
        isTrue,
      );
      expect(
        spans.any((s) => s.style?.fontStyle == FontStyle.italic && s.text == 'i'),
        isTrue,
      );
    });

    test('bold wins over italic: **a** is not parsed as * + *', () {
      final spans =
          ChatMarkdownText.inlineSpans('**a**').whereType<TextSpan>().toList();
      expect(spans.where((s) => s.style?.fontWeight == FontWeight.w600).length, 1);
      expect(spans.any((s) => s.style?.fontStyle == FontStyle.italic), isFalse);
    });

    test('renders `code` with a monospace span', () {
      final spans =
          ChatMarkdownText.inlineSpans('run `npm run dev` now').whereType<TextSpan>();
      final code = spans.firstWhere((s) => s.style?.fontFamily == 'monospace');
      expect(code.text, 'npm run dev');
    });

    test('multiple pairs in one line stay paired (non-greedy)', () {
      final text = 'a **one** b **two** c';
      final bolds = ChatMarkdownText.inlineSpans(text)
          .whereType<TextSpan>()
          .where((s) => s.style?.fontWeight == FontWeight.w600)
          .map((s) => s.text)
          .toList();
      expect(bolds, ['one', 'two']);
    });

    test('unpaired / spaced asterisks stay literal', () {
      // "2 * 3 * 4" is arithmetic, not emphasis: italic requires a
      // non-space character inside the delimiters.
      final spans = ChatMarkdownText.inlineSpans('2 * 3 * 4')
          .whereType<TextSpan>()
          .map((s) => s.text)
          .join('');
      expect(spans, '2 * 3 * 4');
    });
  });

  group('ChatMarkdownText.buildBlocks', () {
    test('heading becomes its own bold block, larger than base', () {
      final blocks = ChatMarkdownText(
        text: '## Overview\nBody text.',
        baseStyle: _base(),
      ).buildBlocks();

      expect(blocks.length, 2);
      final headingRich = blocks.first as Padding;
      final headingSpan = (headingRich.child as Text).textSpan!;
      expect(headingSpan.style?.fontWeight, FontWeight.w700);
      expect(headingSpan.style!.fontSize, greaterThan(13));
    });

    test('bullet line becomes a bullet row and only for "- "/"* "', () {
      final blocks = ChatMarkdownText(
        text: '- first item\n**Bold start** body',
        baseStyle: _base(),
      ).buildBlocks();

      expect(blocks.length, 2);
      final bulletRow = (blocks.first as Padding).child as Row;
      final bulletLabel = (bulletRow.children.first as Text).data;
      expect(bulletLabel, '•');
      // Bold-led paragraph line must NOT be treated as a bullet.
      final body = blocks.last as Text;
      expect(
        (body.textSpan as TextSpan).children!.any(
          (s) => s is TextSpan && s.style?.fontWeight == FontWeight.w600,
        ),
        isTrue,
      );
    });

    test('numbered steps keep their label and content', () {
      final blocks = ChatMarkdownText(
        text: '1. Take photo\n2. Upload',
        baseStyle: _base(),
      ).buildBlocks();

      expect(blocks.length, 2);
      final row = (blocks.first as Padding).child as Row;
      // children: [SizedBox(width) label, Expanded(body)]
      expect((row.children.first as SizedBox).width, 22);
      expect(((row.children.last as Expanded).child as Text).textSpan!.toPlainText(), 'Take photo');
    });

    test('consecutive plain lines merge into one paragraph', () {
      final blocks = ChatMarkdownText(
        text: 'first line\nsecond line',
        baseStyle: _base(),
      ).buildBlocks();

      expect(blocks.length, 1);
      final merged = (blocks.first as Text).textSpan!;
      expect(merged.toPlainText(), contains('first line second line'));
    });

    test('blank lines split paragraphs', () {
      final blocks = ChatMarkdownText(
        text: 'para one\n\npara two',
        baseStyle: _base(),
      ).buildBlocks();

      expect(blocks.length, 2);
    });
  });
}
