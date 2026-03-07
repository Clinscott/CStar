import argparse
import sys
import json
import os
from pathlib import Path
from google import genai
from google.genai import types

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# [🔱] THE ONE MIND: Direct SDK Initialization via ADC
client = genai.Client()

# [Ω] DECOUPLING: Model choice is derived from the environment
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

def main():
    parser = argparse.ArgumentParser(description="One Mind: Sovereign Intelligence Interface.")
    parser.add_argument("--prompt", help="The raw prompt or objective.")
    parser.add_argument("--system_prompt", help="Override the default system prompt.")
    parser.add_argument("--json", action="store_true", help="Expect JSON output.")
    parser.add_argument("--generate-code", action="store_true", help="Enter code generation mode.")
    parser.add_argument("--objective", help="Specific objective for code generation.")
    parser.add_argument("--context", help="Path to context file (lore or code).")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Override the default Gemini model.")

    args = parser.parse_args()

    default_system = "You are the Corvus Star One Mind. Provide sovereign intelligence grounded in repository lore."
    system_instruction = args.system_prompt if args.system_prompt else default_system

    # Load Totem (The Pact) for context
    pact_path = PROJECT_ROOT / "THE_PACT.qmd"
    pact_content = pact_path.read_text(encoding='utf-8') if pact_path.exists() else ""

    if args.generate_code:
        context_content = Path(args.context).read_text(encoding='utf-8') if args.context else ""
        full_prompt = f"""
        ACT AS: The One Mind Architect.
        TOTEM CONTEXT:
        {pact_content}
        
        OBJECTIVE: {args.objective}
        CONSTRAINTS: Output RAW CODE or JSON only. No chat filler.
        
        CONTEXT:
        {context_content}
        """
        system_instruction += " Your output is raw code or JSON. No markdown wrappers unless specified."
    else:
        full_prompt = f"TOTEM CONTEXT:\n{pact_content}\n\nPROMPT:\n{args.prompt}"

    try:
        config = types.GenerateContentConfig(system_instruction=system_instruction)
        if args.json:
            config.response_mime_type = "application/json"

        # [🔱] THE DIRECT STRIKE: Using the environment-aware model choice
        response = client.models.generate_content(
            model=args.model,
            contents=full_prompt,
            config=config
        )
        
        print(response.text if response.text else "The One Mind is silent.")

    except Exception as e:
        print(f"One Mind failed: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
