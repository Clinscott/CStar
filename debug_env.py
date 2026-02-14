import os
from pathlib import Path
from dotenv import load_dotenv

root = Path(__file__).parent.resolve()
env_path = root / ".env.local"
print(f"Loading from: {env_path}")
print(f"File exists: {env_path.exists()}")
if env_path.exists():
    print(f"Content head: {env_path.read_text()[:50]}")

success = load_dotenv(dotenv_path=env_path, verbose=True)
print(f"Load success: {success}")
print(f"GOOGLE_API_KEY: {os.getenv('GOOGLE_API_KEY')}")
