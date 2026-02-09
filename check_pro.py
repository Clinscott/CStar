from google import genai
import os
from dotenv import load_dotenv
from pathlib import Path

# Load env from .env.local
env_local = Path(__file__).parent / ".env.local"
if env_local.exists():
    load_dotenv(dotenv_path=env_local)
else:
    load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("API Key not found")
    exit(1)

print("Initializing google.genai Client...")
client = genai.Client(api_key=api_key)

candidates = ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.0-flash-lite-preview-02-05"]

print("\nAttempting generation with candidate models:")
for model_name in candidates:
    print(f"Testing {model_name}...", end=" ")
    try:
        response = client.models.generate_content(
            model=model_name,
            contents="Hello, are you online?"
        )
        print("SUCCESS")
    except Exception as e:
        print(f"FAILED ({e})")
