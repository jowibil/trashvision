from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
from dependency import require_public, limiter
from models.chat_schema import Chat, ChatResponse
from services.gemini_services import get_chat_reply

router = APIRouter()

# SECURITY (chatbot safeguard pass):
#  1. Rate-limited 10/minute per IP — every call costs Gemini credits. This is
#     the budget guard (the edge-layer option is DEFERRED until an owned
#     domain exists — see docs/cloudflare-chat-edge-rule.md). The limiter key
#     prefers CF-Connecting-IP so per-IP buckets would survive a future
#     Cloudflare-proxied api. domain (dependency.py).
#  2. PUBLIC access (product decision 2026-11: the web portal is admins plus
#     anonymous guests, and login is deliberately hidden — there is no visible
#     sign-in surface to send guests to). Chat runs under require_public()
#     like every other anonymous-browsable read:
#       - no token -> anonymous chat allowed;
#       - valid token -> unchanged;
#       - expired/invalid token -> 401, same as before.
#     Anonymity leaks nothing here: the endpoint is statelessly read-only —
#     no writes tied to identity (point 3) and replies are built from public
#     aggregate stats, never per-user data. The limiter above is what stops
#     anonymous traffic from driving the Gemini bill.
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
