import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    print("[FAIL] python-dotenv is not installed. Run: pip install python-dotenv")
    exit(1)

def verify():
    # Target the .env.local in the current execution directory (project root)
    env_path = Path(".env.local").resolve()
    
    print(f"Targeting environment file: {env_path}")
    
    if not env_path.exists():
        print(f"[FAIL] {env_path.name} does not exist at this location.")
        return

    # Load the variables
    load_dotenv(env_path)
    
    # Check for the specific Daemon key
    key = os.getenv("GOOGLE_API_DAEMON_KEY")
    
    if key:
        # Mask the key for visual confirmation without leaking security
        masked_key = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "***"
        print(f"[SUCCESS] GOOGLE_API_DAEMON_KEY verified: {masked_key}")
    else:
        print(f"[FAIL] GOOGLE_API_DAEMON_KEY is missing or empty in {env_path.name}.")

if __name__ == "__main__":
    verify()