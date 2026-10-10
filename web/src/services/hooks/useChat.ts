import { useState } from 'react';
import { sendMessage as sendApiMessage, type ChatHistoryTurn } from '../chatApi';

export interface ChatMessageData {
  role: 'user' | 'bot';
  text: string;
}

// Stateless backend: the client owns conversation memory. Keep the last
// 8 messages (4 user + 4 bot) — enough context for a 2–5 sentence assistant
// without growing payloads.
const HISTORY_WINDOW = 8;

function toHistoryTurns(messages: ChatMessageData[]): ChatHistoryTurn[] {
  return messages
    // The greeting is not part of the real conversation.
    .filter((m) => m.role === 'user' || m.role === 'bot')
    .slice(-HISTORY_WINDOW)
    .map((m) => ({
      role: (m.role === 'bot' ? 'model' : 'user') as ChatHistoryTurn['role'],
      text: m.text,
    }));
}

export interface UseChatReturn {
  messages: ChatMessageData[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessageData[]>([
    {
      role: 'bot',
      text: 'Hello! I am your TrashVision assistant. How can I help you today?',
    },
  ]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const [conversationId] = useState<string>(() => crypto.randomUUID());

  const sendMessage = async (text: string): Promise<void> => {
    const trimmedText = text.trim();
    if (!trimmedText || isLoading) return;

    const userMsg: ChatMessageData = { role: 'user', text: trimmedText };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // Snapshot history BEFORE appending the new user message, and strip
      // the initial greeting from it.
      const history = toHistoryTurns(messages.slice(1));
      const data = await sendApiMessage(conversationId, trimmedText, history);
      setMessages((prev) => [...prev, { role: 'bot', text: data.reply }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: 'Sorry, I ran into an issue connecting to the service. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    isLoading,
    sendMessage,
  };
}