import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from sqlalchemy import create_engine
from config import settings

try:
    print(f"Attempting to connect to: {settings.DATABASE_URL}")
    engine = create_engine(settings.DATABASE_URL)
    connection = engine.connect()
    print("Connection successful!")
    connection.close()
except Exception as e:
    print(f"Connection failed: {e}")