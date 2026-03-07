import argparse
import sys
from pathlib import Path
from google import genai
from google.genai import types

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# [🔱] THE ONE MIND: Direct SDK Initialization via ADC
client = genai.Client()

def main():
    parser = argparse.ArgumentParser(description="Gungnir Oracle: High-fidelity intelligence.")
    parser.add_argument("--query", required=True, help="The natural language query.")
    parser.add_argument("--system_prompt", help="Override the default system prompt.")
    args = parser.parse_args()

    default_system = "You are the Corvus Star Intelligence Oracle. Provide precise, technical analysis based on the repository lore."
    system_instruction = args.system_prompt if args.system_prompt else default_system

    try:
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=args.query,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction
            )
        )
        
        print(response.text if response.text else "The Oracle is silent.")

    except Exception as e:
        print(f"Oracle failed: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
