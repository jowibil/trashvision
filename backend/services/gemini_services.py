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

async def get_chat_reply(message: str, history: list[dict]) -> str:
    """
    Communicates with GEMINI SDK using loaded prompt and chat history context.
    """
    try:
        contents = []
        for turn in history:
            contents.append(
                types.Content(
                    role=turn["role"],
                    parts=[types.Part.from_text(text=turn["text"])]
                )
            )
            
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=message)]
            )
        )
        
        # response = client.models.generate_content(
        #     model=settings.GEMINI_MODEL_NAME,
        #     contents=contents,
        #     config=types.GenerateContentConfig(
        #         system_instruction=SYSTEM_PROMPT,
        #         temperature=0.4,
        #     )
        # )
        chat = client.chats.create(model=settings.GEMINI_MODEL_NAME, config=types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT, temperature=0.4
        ))
        response = chat.send_message(message)
        
        return response.text or "I couldn't process that request properly. Please try again."
    
    except Exception as e:
        print(f"[Gemini service error]: {e}")
        return "Sorry, I am having trouble connecting to the service right now."