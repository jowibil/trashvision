from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
from dependency import require_role, limiter
from models.chat_schema import Chat, ChatResponse
from services.gemini_services import get_chat_reply

router = APIRouter()

# SECURITY (chatbot safeguard pass):
#  1. Rate-limited 10/minute per IP — every call costs Gemini credits.
#  2. JWT required (guest = any logged-in user). The ChatWidget is mounted at
#     the app root in web/src/App.tsx; on public pages it should surface a
#     sign-in prompt instead of a working composer (client follow-up).
#  3. Fully STATELESS: the client sends conversation_id + rolling history; the
#     backend keeps no session store. This removes the old unbounded
#     in-memory dict (memory-exhaustion DoS + cross-user session hijack by
#     guessing conversation UUIDs).
#  4. Input bounds (UUID id, 1000-char message, <=8 history turns) live in
#     models/chat_schema.py so malformed requests are rejected by pydantic
#     with 422 before any expensive work happens.


@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def chat_endpoint(
    request: Request,
    payload: Chat,
    db: Session = Depends(get_db),
    _user=Depends(require_role("guest")),
):
    bot_reply = await get_chat_reply(
        message=payload.message,
        history=[turn.model_dump() for turn in payload.history],
    )

    return ChatResponse(
        reply=bot_reply,
        conversation_id=payload.conversation_id,
    )
