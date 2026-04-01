import asyncio
import sys
from pathlib import Path

# Add CStar root to sys.path
CSTAR_ROOT = Path("/home/morderith/Corvus/CStar")
sys.path.insert(0, str(CSTAR_ROOT))

from src.cstar.core.uplink import AntigravityUplink
from src.core.sovereign_hud import SovereignHUD

async def main():
    sample_path = CSTAR_ROOT / "docs/legacy_archive/stragglers/temp_prologue_trial_v8.txt"
    if not sample_path.exists():
        print(f"Error: Sample not found at {sample_path}")
        return

    sample_text = sample_path.read_text(encoding='utf-8')
    
    prompt = (
        "You are a narrative voice analyst. Analyze the following manuscript and generate a "
        "BDD Gherkin voice contract that accurately reflects the writing style found in the text.\n\n"
        "Analyze:\n"
        "- Cadence, sentence structure, and rhythm patterns\n"
        "- Vocabulary choices (e.g., evocative, sensory, archaic)\n"
        "- Punctuation patterns and formatting quirks\n"
        "- Emotional signature and narrative distance\n\n"
        "MANUSCRIPT EXCERPTS:\n"
        f"{sample_text[:10000]}\n\n"
        "MANDATE: Return ONLY the Gherkin feature file content. "
        "Use the following structure:\n"
        "Feature: [Style Name]\n"
        "  Background: [Brief description of the voice]\n"
        "  Scenario: Cadence and Rhythm\n"
        "    Given a sentence is being formed\n"
        "    Then it should [rule]...\n"
        "  Scenario: Vocabulary and Diction\n"
        "    ...\n"
    )
    
    print("[🔱] Extracting style from sample...")
    response = await AntigravityUplink.query_bridge(prompt, {"persona": "ODIN", "workflow": "TALIESIN_INGEST"})
    
    if response.get("status") == "success":
        raw_output = response.get("data", {}).get("raw", "")
        # Clean markdown fences
        if "```" in raw_output:
            raw_output = raw_output.split("```")[1]
            if raw_output.startswith("gherkin"):
                raw_output = raw_output[7:]
            raw_output = raw_output.strip()
            
        voices_dir = CSTAR_ROOT / ".lore/voices"
        voices_dir.mkdir(parents=True, exist_ok=True)
        target_path = voices_dir / "UserStyle.feature"
        target_path.write_text(raw_output, encoding='utf-8')
        print(f"[SUCCESS] Voice contract generated at {target_path}")
        print("\n--- CONTRACT PREVIEW ---\n")
        print(raw_output)
    else:
        print(f"[FAIL] Style extraction failed: {response.get('message')}")

if __name__ == "__main__":
    asyncio.run(main())
