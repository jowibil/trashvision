import api from "../api/axios";

export interface ChatRequestPayload {
  conversation_id: string;
  message: string;
}

export interface ChatResponseData {
  reply: string;
  conversation_id: string;
}

export async function sendMessage(
  conversationId: string, 
  message: string
): Promise<ChatResponseData> {
  const response = await api.post<ChatResponseData>('/gemini/chat', {
    conversation_id: conversationId,
    message: message,
  });

  return response.data;
}