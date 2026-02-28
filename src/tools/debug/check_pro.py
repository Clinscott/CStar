import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai


def main() -> int:
    """
    Initializes the genai client, iterates through a list of candidate models,
    and attempts to generate content to check for their availability.
    """
    # Load env from .env.local
    env_local = Path(__file__).parent / ".env.local"
    if env_local.exists():
        load_dotenv(dotenv_path=env_local)
    else:
        load_dotenv()

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("API Key not found")
        return 1 # Return an error code for testability

    print("Initializing google.genai Client...")
    client = genai.Client(api_key=api_key)

    candidates = ["gemini-3.1-flash-preview", "gemini-3.1-pro-preview", "gemini-3-flash-preview"]

    print("\nAttempting generation with candidate models:")
    for model_name in candidates:
        print(f"Testing {model_name}...", end=" ")
        try:
            # This network call will be mocked during tests
            client.models.generate_content(
                model=model_name,
                contents="Hello, are you online?"
            )
            print("SUCCESS")
        except Exception as e:
            print(f"FAILED ({e})")

    return 0 # Return success code

if __name__ == "__main__":
    main()
