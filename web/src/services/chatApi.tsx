import api from "../api/axios";

// Matches backend models/chat_schema.py: roles restricted to 'user' | 'model',
// history capped at 8 turns server-side (we trim to 4 pairs here).
export interface ChatHistoryTurn {
  role: "user" | "model";
  text: string;
}

export interface ChatRequestPayload {
  conversation_id: string;
  message: string;
  history: ChatHistoryTurn[];
}

export interface ChatResponseData {
  reply: string;
  conversation_id: string;
}

export async function sendMessage(
  conversationId: string,
  message: string,
  history: ChatHistoryTurn[] = [],
): Promise<ChatResponseData> {
  const response = await api.post<ChatResponseData>('/gemini/chat', {
    conversation_id: conversationId,
    message: message,
    history: history,
  });

  return response.data;
}