import argparse
import json
import os
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
    parser = argparse.ArgumentParser(description="Taliesin Forge: Weave code from lore.")
    parser.add_argument("--lore", required=True, help="Relative path to the lore file.")
    parser.add_argument("--objective", help="Optional objective override.")
    args = parser.parse_args()

    lore_path = PROJECT_ROOT / args.lore
    if not lore_path.exists():
        print(f"[ALFRED]: CRITICAL - Lore missing at {lore_path}")
        sys.exit(1)

    lore_content = lore_path.read_text(encoding='utf-8')
    
    prompt = f"""
    ACT AS: The Taliesin Forge Architect.
    MANDATE: Translate the following Lore Fragment into a production-ready Code Artifact.
    
    OBJECTIVE: {args.objective if args.objective else 'Materialize the architecture defined in the lore.'}
    
    LORE FRAGMENT:
    ```
    {lore_content}
    ```
    
    CONSTRAINTS:
    1. Output MUST be a valid JSON object.
    2. Fields: "target_path" (relative to root) and "code" (full file content).
    3. Follow the Linscott Standard: Strict typing, comprehensive docstrings.
    4. Language: Match the project's stack (Python or TypeScript).
    """

    print(f"[Ω] Forge: Requesting materialization (Direct Strike)...", file=sys.stderr)
    
    try:
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="You are the Taliesin Forge. Your output is raw JSON with 'target_path' and 'code' fields. No markdown wrappers."
            )
        )

        raw = response.text
        # Handle possible markdown noise
        clean_json = raw.strip()
        if clean_json.startswith("```json"):
            clean_json = clean_json.split("```json")[1].split("```")[0].strip()
        elif clean_json.startswith("```"):
            clean_json = clean_json.split("```")[1].split("```")[0].strip()
        
        data = json.loads(clean_json)

        if not data.get("target_path") or not data.get("code"):
            raise ValueError("One Mind provided incomplete artifact data (missing target_path or code).")

        staged_dir = PROJECT_ROOT / ".agents/forge_staged"
        staged_dir.mkdir(parents=True, exist_ok=True)
        
        artifact_name = Path(data["target_path"]).name
        stage_path = staged_dir / artifact_name
        stage_path.write_text(data["code"], encoding='utf-8')

        print(f"[🔱] Artifact forged successfully: {data['target_path']}")
        print(f"[ALFRED]: Staged for review at .agents/forge_staged/{artifact_name}")

    except Exception as e:
        print(f"Forge failed: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
