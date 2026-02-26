import os

from dotenv import load_dotenv
from google import genai

# Load .env.local explicitly
load_dotenv(".env.local")

def list_models():
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("Error: GOOGLE_API_KEY not found in .env.local")
        return

    print(f"Using API Key: {api_key[:5]}...")

    try:
        client = genai.Client(api_key=api_key)
        print("Listing available models...")
        # Note: client.models.list() returns an iterator
        for m in client.models.list():
            print(f"- {m.name} (Display: {m.display_name})")

    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    list_models()
