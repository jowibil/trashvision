from pydantic import BaseModel
from pydantic import Field


class Chat(BaseModel):
    conversation_id: str
    message: str
    
    
class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
    


