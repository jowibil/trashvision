from fastapi import APIRouter, HTTPException, status
from models.chat_schema import Chat, ChatResponse
from services.gemini_services import get_chat_reply

router = APIRouter()

in_memory_chat_sessions: dict[str, list[dict]] = {}

@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
async def chat_endpoint(payload: Chat):
    conversation_id = payload.conversation_id
    user_message = payload.message.strip()

    if not user_message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Message content cannot be empty."
        )

    if conversation_id not in in_memory_chat_sessions:
        in_memory_chat_sessions[conversation_id] = []

    session_history = in_memory_chat_sessions[conversation_id]

    bot_reply = await get_chat_reply(message=user_message, history=session_history)

    session_history.append({"role": "user", "text": user_message})
    session_history.append({"role": "model", "text": bot_reply})

    return ChatResponse(
        reply=bot_reply,
        conversation_id=conversation_id
    )