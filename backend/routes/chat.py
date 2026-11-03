from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
from dependency import require_public, limiter
from models.chat_schema import Chat, ChatResponse
from services.gemini_services import get_chat_reply

router = APIRouter()

# How /chat is protected:
#
# 1. Cost control. Every reply costs a Gemini API call, so requests are
#    capped at 10 per minute per IP (the key logic lives in
#    dependency.py). A stronger Cloudflare edge rule has been designed
#    but is not switched on yet — docs/cloudflare-chat-edge-rule.md
#    holds the full plan.
# 2. Open to guests. The web portal serves admins plus anonymous visitors
#    (login is hidden on purpose), so the chatbot guards itself with
#    require_public(), same as the other public read endpoints:
#      no token       -> anonymous chat is fine
#      valid token    -> works as normal
#      expired token  -> 401, same as any stale session
#    Open access leaks nothing here: the endpoint stores nothing, writes
#    nothing by identity, and builds replies from public aggregates only.
#    The rate limit is what stops anonymous traffic from running up the
#    API bill.
# 3. No server memory. The client sends the conversation id and its
#    recent history with every request; the backend keeps no session
#    store. This retired the old in-memory dict, which could be flooded
#    with sessions and had guessable ids.
# 4. Inputs are validated in models/chat_schema.py (real UUID id,
#    1000-character message, at most 8 history turns), so malformed
#    requests die with a 422 before anything expensive runs.


@router.post("/chat", response_model=ChatResponse, status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def chat_endpoint(
    request: Request,
    payload: Chat,
    db: Session = Depends(get_db),
    _user=Depends(require_public()),
):
    bot_reply = await get_chat_reply(
        message=payload.message,
        history=[turn.model_dump() for turn in payload.history],
    )

    return ChatResponse(
        reply=bot_reply,
        conversation_id=payload.conversation_id,
    )
