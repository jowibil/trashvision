import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../services/api_client.dart' show logAndReport, userMessage;
import '../services/chat_service.dart';
import '../widgets/bottom_nav.dart';

/// Mobile chat screen (brief Task 4, mobile half): CCia with the same
/// backend endpoint the web widget uses. Simple by design — message list,
/// input, loading, error — stateless client-driven history.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  late String _conversationId;
  final List<ChatTurnModel> _history = [];
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _conversationId = cryptoRandomUUID();
  }

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

    setState(() {
      _history.add(ChatTurnModel(role: 'user', text: text));
      _sending = true;
      _error = null;
    });
    _controller.clear();
    _scrollToBottom();

    try {
      final reply = await ChatService.sendMessage(_conversationId, text, _history);
      if (!mounted) return;
      setState(() {
        _history.add(ChatTurnModel(role: 'model', text: reply));
        _sending = false;
      });
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = userMessage(e);
      });
      logAndReport(e, context: 'chat send');
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: motionDuration,
        curve: motionCurve,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        backgroundColor: primaryBlue,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text(
          'Ask TrashVision',
          style: TextStyle(
            fontWeight: FontWeight.w900,
            color: Colors.white,
            letterSpacing: -0.5,
          ),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _messagesList(),
          ),
          _composer(),
        ],
      ),
      bottomNavigationBar: const BottomNavBar(currentIndex: 0),
    );
  }

  Widget _messagesList() {
    if (_history.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.forum_outlined, size: 42, color: inkMuted),
            const SizedBox(height: 12),
            Text(
              'Ask about shoreline waste, the map,\nor how TrashVision works.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: inkMuted, height: 1.5),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      physics: const BouncingScrollPhysics(),
      itemCount: _history.length + ((_sending || _error != null) ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == _history.length) {
          return _sending ? _loadingBubble() : _errorBubble();
        }
        final turn = _history[i];
        return _bubble(turn);
      },
    );
  }

  Widget _bubble(ChatTurnModel turn) {
    final isUser = turn.role == 'user';
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        decoration: BoxDecoration(
          color: isUser ? primaryBlue : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(isUser ? 14 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 14),
          ),
          border: isUser ? null : Border.all(color: Colors.grey.shade300, width: 1),
        ),
        child: Text(
          turn.text,
          style: TextStyle(
            fontSize: 13,
            height: 1.45,
            color: isUser ? Colors.white : const Color(0xFF334155),
          ),
        ),
      ),
    );
  }

  /// Honest thinking-state bubble: a typing dot row (animation cheaper than
  /// shimmer, and honest — it doesn't pretend the reply has the answer yet).
  Widget _loadingBubble() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(14),
            topRight: Radius.circular(14),
            bottomLeft: Radius.circular(4),
            bottomRight: Radius.circular(14),
          ),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: const Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2.5, color: primaryBlue),
          ),
        ),
      ),
    );
  }

  Widget _errorBubble() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFFEF2F2),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.red.shade200),
        ),
        child: Text(
          _error!,
          style: TextStyle(fontSize: 12, color: Colors.red.shade800, height: 1.4),
        ),
      ),
    );
  }

  Widget _composer() {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(
            top: BorderSide(color: Colors.grey.shade200),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                enabled: !_sending,
                maxLines: null,
                decoration: InputDecoration(
                  hintText: _sending ? 'Waiting for a reply…' : 'Type a message…',
                  hintStyle: TextStyle(fontSize: 13, color: inkMuted),
                  filled: true,
                  fillColor: const Color(0xFFF8FAFC),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: primaryBlue, width: 1.5),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            AnimatedContainer(
              duration: motionDuration,
              curve: motionCurve,
              child: _sending
                  ? const Padding(
                      padding: EdgeInsets.all(10),
                      child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: primaryBlue,
                        ),
                      ),
                    )
                  : CircleAvatar(
                      radius: 22,
                      backgroundColor: primaryBlue,
                      child: IconButton(
                        icon: const Icon(Icons.send, color: Colors.white, size: 18),
                        onPressed: _send,
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
