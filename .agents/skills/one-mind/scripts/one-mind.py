import argparse
import sys
import json
import os
import subprocess
from pathlib import Path
from google import genai
from google.genai import types

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def setup_local_environment():
    """Binds the One Mind to the Shaman's local environment credentials."""
    # 1. Load .env if present
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        from dotenv import load_dotenv
        load_dotenv(env_path)
    
    # 2. Bind Windows ADC if present (The Shaman's Native Key)
    adc_path = Path(r"C:\Users\Craig\AppData\Roaming\gcloud\application_default_credentials.json")
    if adc_path.exists() and "GOOGLE_APPLICATION_CREDENTIALS" not in os.environ:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(adc_path)

def get_client():
    setup_local_environment()
    try:
        # Will automatically use GEMINI_API_KEY, GOOGLE_API_KEY, or ADC
        return genai.Client()
    except Exception as e:
        print(f"[ALFRED]: CRITICAL - The One Mind cannot find its anchor in the local environment: {e}", file=sys.stderr)
        sys.exit(1)

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

def main():
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

    parser = argparse.ArgumentParser(description="One Mind: Native Environment Conduit.")
    parser.add_argument("--prompt", help="The raw prompt or objective.")
    parser.add_argument("--system_prompt", help="Override the default system prompt.")
    parser.add_argument("--json", action="store_true", help="Expect JSON output.")
    parser.add_argument("--generate-code", action="store_true", help="Enter code generation mode.")
    parser.add_argument("--objective", help="Specific objective for code generation.")
    parser.add_argument("--context", help="Path to context file (lore or code).")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Override the default Gemini model.")
    
    args = parser.parse_args()
    
    if not args.prompt and not args.objective:
        parser.print_help()
        return

    client = get_client()

    default_system = "You are the Corvus Star One Mind. Provide sovereign intelligence grounded in repository lore."
    system_instruction = args.system_prompt if args.system_prompt else default_system

    pact_path = PROJECT_ROOT / "THE_PACT.qmd"
    pact_content = pact_path.read_text(encoding='utf-8') if pact_path.exists() else ""

    if args.generate_code:
        context_content = Path(args.context).read_text(encoding='utf-8') if args.context else ""
        full_prompt = f"TOTEM CONTEXT:\n{pact_content}\n\nOBJECTIVE: {args.objective}\nCONSTRAINTS: Output RAW CODE or JSON only.\nCONTEXT:\n{context_content}"
        system_instruction += " Your output is raw code or JSON. No markdown wrappers unless specified."
    else:
        full_prompt = f"TOTEM CONTEXT:\n{pact_content}\n\nPROMPT:\n{args.prompt}"

    try:
        config = types.GenerateContentConfig(system_instruction=system_instruction)
        if args.json:
            config.response_mime_type = "application/json"

        response = client.models.generate_content(
            model=args.model,
            contents=full_prompt,
            config=config
        )
        
        reply = response.text if response.text else "The One Mind is silent."
        print(reply)

    except Exception as e:
        print(f"[ALFRED]: One Mind Strike Failed: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
