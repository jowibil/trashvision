import { useState } from 'react';
import { sendMessage as sendApiMessage } from '../chatApi';

export interface ChatMessageData {
  role: 'user' | 'bot';
  text: string;
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
      const data = await sendApiMessage(conversationId, trimmedText);
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