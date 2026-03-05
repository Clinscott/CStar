import asyncio
import argparse
from pathlib import Path
from typing import Dict, Any, List
from difflib import SequenceMatcher

import sys
sys.path.append(str(Path(__file__).resolve().parent.parent.parent))

from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink

class CohesionScorer:
    def __init__(self):
        self.uplink = AntigravityUplink()

    def lexical_score(self, generated_text: str, true_text: str) -> float:
        """Calculate the lexical overlap between the generated text and the true text."""
        # Clean and tokenize
        gen_words = [w.strip().lower() for w in generated_text.replace('\n', ' ').split() if w.strip()]
        true_words = [w.strip().lower() for w in true_text.replace('\n', ' ').split() if w.strip()]
        
        if not true_words:
            return 0.0

        # Use SequenceMatcher to find the ratio of overlap (0 to 1)
        matcher = SequenceMatcher(None, gen_words, true_words)
        ratio = matcher.ratio()
        
        # Convert to percentage
        return round(ratio * 100, 2)

    async def intent_score(self, generated_text: str, true_text: str) -> str:
        """Use the One Mind to evaluate the emotional and narrative intent of the generated text against the true text."""
        prompt = (
            "You are the Cohesion Auditor. Your job is to compare an AI-generated scene against the TRUE manuscript text. "
            "You must score the AI-generated text strictly on Intent Alignment out of 100.\n\n"
            "Evaluate based on:\n"
            "1. Did the characters behave with the same emotional weight and psychology?\n"
            "2. Did the narrator capture the exact same solemn, mythic tone?\n"
            "3. Were the physical descriptions and actions matching the intent of the original author?\n\n"
            f"TRUE MANUSCRIPT TEXT:\n{true_text}\n\n"
            f"AI-GENERATED TEXT:\n{generated_text}\n\n"
            "MANDATE: Output a detailed evaluation of where the AI failed, followed by a final 'SCORE: X/100'. "
            "Be brutal. If it sounds generic, lower the score."
        )
        response = await self.uplink.send_payload(prompt, {"persona": "ODIN"})
        return response.get("data", {}).get("raw", "Failed to retrieve intent score.") if response.get("status") == "success" else "Error communicating with One Mind."

    async def run_audit(self, generated_file: Path, true_file: Path):
        SovereignHUD.box_top("⚖️ ITERATIVE COHESION SCORING")
        
        if not generated_file.exists():
            SovereignHUD.persona_log("FAIL", f"Generated file not found: {generated_file}")
            return
        if not true_file.exists():
            SovereignHUD.persona_log("FAIL", f"True text file not found: {true_file}")
            return

        gen_text = generated_file.read_text(encoding='utf-8')
        true_text = true_file.read_text(encoding='utf-8')

        # Run Lexical Score
        SovereignHUD.persona_log("INFO", "[AUDITOR] Calculating Lexical Match...")
        lexical_match = self.lexical_score(gen_text, true_text)
        print(f"\n  → Lexical Word Overlap: {lexical_match}%")
        
        if lexical_match < 50:
             SovereignHUD.persona_log("WARN", "Lexical match is extremely low. The pipeline failed to reconstruct the exact prose.")
        else:
             SovereignHUD.persona_log("SUCCESS", "High lexical vocabulary match with True Text.")

        # Run Intent Score
        SovereignHUD.persona_log("INFO", "[AUDITOR] Evaluating Narrative Intent via One Mind...")
        intent_eval = await self.intent_score(gen_text, true_text)
        
        SovereignHUD.box_separator()
        print(f"\n{intent_eval}\n")
        SovereignHUD.box_separator()
        
        SovereignHUD.persona_log("INFO", "Audit Complete. Use these results to tighten the Gherkin .feature contracts.")

async def main():
    parser = argparse.ArgumentParser(description="Iterative Cohesion Scoring for Fallows Hallow")
    parser.add_argument("--generated", type=str, required=True, help="Path to the generated chapter file (e.g., .lore/chapter_1.md)")
    parser.add_argument("--true", type=str, required=True, help="Path to the true manuscript excerpt file")
    
    args = parser.parse_args()
    
    gen_path = Path(args.generated)
    true_path = Path(args.true)
    
    scorer = CohesionScorer()
    await scorer.run_audit(gen_path, true_path)

if __name__ == "__main__":
    asyncio.run(main())
