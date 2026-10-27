from pathlib import Path

from google import genai
from google.genai import types

from config import settings


PROMPT_FILE_PATH = Path(__file__).parent.parent / "prompts" / "trashvision_chatbot.md"


try: 
    SYSTEM_PROMPT = PROMPT_FILE_PATH.read_text(encoding="utf-8")
except Exception as e:
    SYSTEM_PROMPT = "You are TrashVision AI assistant, specializing in waste management and reporting."

    
client = genai.Client(api_key=settings.GEMINI_API_KEY)

# Safeguard: cap the model's output. The persona asks for 2–5 sentence
# replies; the cap bounds per-request cost and latency.
#
# HEADROOM vs thinking (verified 2026-10-27): gemini-3.6-flash is a thinking
# model — thought tokens count against max_output_tokens. At the old cap
# (400) a probe returned finish_reason=MAX_TOKENS with a 75-char mid-sentence
# fragment: thoughts consumed 380 of 400 and only 16 tokens reached the
# client. Two fixes together:
#   1. thinking_budget=0 — the short-answer persona needs no hidden
#      reasoning; thoughts also burned seconds of latency.
#   2. 1024 cap — still a hard cost guard, now sized for the actual reply.
MAX_OUTPUT_TOKENS = 1024

# Disable hidden reasoning for the 2–5-sentence persona (see above).
THINKING_BUDGET = 0

# Client-side ceiling for the Gemini HTTP round-trip so a hung call can't
# hold a FastAPI worker indefinitely.
REQUEST_TIMEOUT_SECONDS = 30


def _log_error(conversation_hint: str, error: Exception) -> None:
    """Structured-enough server-side logging for the error path (never sent
    to clients — the API returns a generic message)."""
    print(f"[Gemini service error] ctx={conversation_hint}: {error}")


def _live_data_block(message: str) -> str | None:
    """Task 4: build the LIVE DATA block for this request. Kept in a tiny
    helper so a block-builder failure (DB hiccup) degrades to a normal
    chatbot answer instead of failing the endpoint."""
    try:
        from database import SessionLocal
        from services.chat_data_service import build_live_data_block

        db = SessionLocal()
        try:
            return build_live_data_block(db, message)
        finally:
            db.close()
    except Exception as e:
        _log_error("live-data block", e)
        return None


async def get_chat_reply(message: str, history: list[dict]) -> str:
    """
    Stateless Gemini call: system prompt + live data block + explicit
    history contents + the new user message, in ONE generate_content request.

    Task 4 (live data): the system prompt is static (persona/rules). The
    dynamic numbers arrive in a separate data block appended to
    `system_instruction`, labeled LIVE DATA — so rules stay rules and
    volatile evidence is clearly separated. A failed DB build only drops
    the block (falls back to the static persona), never the endpoint.

    FIX (was dead code): the previous implementation built `contents` from
    `history` but then created a FRESH `client.chats.create(...)` chat and
    called send_message() — the history was silently discarded, so the bot
    had no conversational memory. This version passes history through
    generate_content properly and stores no server-side state.
    """
    try:
        system_prompt = SYSTEM_PROMPT
        block = _live_data_block(message)
        if block:
            system_prompt = f"{SYSTEM_PROMPT}\n\n{block}"

        contents = []
        for turn in history:
            contents.append(
                types.Content(
                    role=turn["role"],
                    parts=[types.Part.from_text(text=turn["text"])],
                )
            )

        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=message)],
            )
        )

        response = await client.aio.models.generate_content(
            model=settings.GEMINI_MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.4,
                max_output_tokens=MAX_OUTPUT_TOKENS,
                thinking_config=types.ThinkingConfig(
                    thinking_budget=THINKING_BUDGET,
                ),
                http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_SECONDS * 1000),
            ),
        )

        return response.text or "I couldn't process that request properly. Please try again."
    
    except Exception as e:
        _log_error("chat", e)
        return "Sorry, I am having trouble connecting to the service right now."