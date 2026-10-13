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
    # SECURITY: must be a real UUID. The old server-side session store keyed
    # on arbitrary client strings; requiring a UUID (as the web client
    # already sends via crypto.randomUUID()) prevents arbitrary-key abuse.
    conversation_id: str

    # SECURITY: cap input so one request can't burn unbounded Gemini tokens.
    # ~1000 chars comfortably fits the assistant's 2–5 sentence persona.
    message: str = Field(max_length=1000)

    # Stateless conversation context: client sends the last few turns; the
    # backend keeps NO chat session memory.
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
    


