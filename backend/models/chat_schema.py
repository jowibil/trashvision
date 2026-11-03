import uuid

from pydantic import BaseModel, Field, field_validator

# Rolling history window sent by the client (stateless backend — see
# services/gemini_services.py). 8 turns = 4 user + 4 model messages, plenty
# for the 2–5 sentence persona, bounded so payloads can't balloon.
MAX_HISTORY_TURNS = 8

class ChatTurn(BaseModel):
    role: str
    text: str

    @field_validator("role")
    @classmethod
    def role_must_be_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("user", "model"):
            raise ValueError("role must be 'user' or 'model'")
        return v

    @field_validator("text")
    @classmethod
    def text_must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("history text cannot be empty")
        return v

class Chat(BaseModel):
    # Must be a real UUID. An older server-side session store accepted
    # arbitrary client strings; validating a UUID (the web client already
    # generates one with crypto.randomUUID()) keeps that key from being
    # abused.
    conversation_id: str

    # Caps the message length — one request can't make the Gemini call
    # as large as it likes. 1000 chars comfortably fits the assistant's
    # 2–5 sentence style.
    message: str = Field(max_length=1000)

    # Conversation context the client sends along (the server keeps NO
    # chat memory).
    history: list[ChatTurn] = Field(default_factory=list, max_length=MAX_HISTORY_TURNS)

    @field_validator("conversation_id")
    @classmethod
    def conversation_id_must_be_uuid(cls, v: str) -> str:
        try:
            uuid.UUID(v)
        except ValueError as e:
            raise ValueError("conversation_id must be a valid UUID") from e
        return v

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message content cannot be empty.")
        return v.strip()


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
    


