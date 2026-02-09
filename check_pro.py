import google.generativeai as genai
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

genai.configure(api_key=api_key)

print("Checking available models...")
try:
    models = [m.name for m in genai.list_models()]
    for m in models:
        print(f"- {m}")
        
    print("\nAttempting generation with candidate models:")
    candidates = ["gemini-1.5-pro", "gemini-pro", "gemini-1.5-pro-latest", "gemini-pro-latest"]
    
    for model_name in candidates:
        print(f"Testing {model_name}...", end=" ")
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content("Hello")
            print("SUCCESS")
        except Exception as e:
            print(f"FAILED ({e})")
            
except Exception as e:
    print(f"Error listing/testing: {e}")
