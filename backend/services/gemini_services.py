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
# replies; ~400 tokens covers that with headroom while bounding per-request
# cost and latency.
MAX_OUTPUT_TOKENS = 400

# Client-side ceiling for the Gemini HTTP round-trip so a hung call can't
# hold a FastAPI worker indefinitely.
REQUEST_TIMEOUT_SECONDS = 30


def _log_error(conversation_hint: str, error: Exception) -> None:
    """Structured-enough server-side logging for the error path (never sent
    to clients — the API returns a generic message)."""
    print(f"[Gemini service error] ctx={conversation_hint}: {error}")


async def get_chat_reply(message: str, history: list[dict]) -> str:
    """
    Stateless Gemini call: system prompt + explicit history contents + the
    new user message, in ONE generate_content request.

    FIX (was dead code): the previous implementation built `contents` from
    `history` but then created a FRESH `client.chats.create(...)` chat and
    called send_message() — the history was silently discarded, so the bot
    had no conversational memory. This version passes history through
    generate_content properly and stores no server-side state.
    """
    try:
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
                system_instruction=SYSTEM_PROMPT,
                temperature=0.4,
                max_output_tokens=MAX_OUTPUT_TOKENS,
                http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_SECONDS * 1000),
            ),
        )

        return response.text or "I couldn't process that request properly. Please try again."
    
    except Exception as e:
        _log_error("chat", e)
        return "Sorry, I am having trouble connecting to the service right now."