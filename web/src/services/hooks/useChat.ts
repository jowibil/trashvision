import axios from 'axios';
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
      // Match the error to an honest message instead of a generic "connection
      // issue": a 401 here is almost always a stale/expired token (anonymous
      // chat is the default — a 401 means a token WAS sent and rejected), and
      // a 429 is the server-side rate limiter protecting the Gemini credit
      // budget. Network/CORS failures have no response at all.
      let fallbackText =
        'Sorry, I ran into an issue connecting to the service. Please try again.';
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        fallbackText =
          'Your session has expired. Sign in again to keep using the assistant.';
      } else if (axios.isAxiosError(error) && error.response?.status === 429) {
        fallbackText =
          'You are sending messages too quickly. Please wait a moment and try again.';
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          text: fallbackText,
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