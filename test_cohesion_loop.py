import asyncio
import os
import sys
import json
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Expand project root for imports
project_root = Path(r"c:\Users\Craig\Corvus\CorvusStar")
sys.path.append(str(project_root))

load_dotenv(project_root / ".env.local")
load_dotenv(project_root / ".env")

from src.sentinel.taliesin import TaliesinSpoke
from src.core.sovereign_hud import SovereignHUD

async def run_loop(score_only=False):
    taliesin = TaliesinSpoke(project_root)
    trial_path = project_root / "temp_prologue_trial_v8.txt"
    
    if score_only:
        if not trial_path.exists():
            SovereignHUD.log("FAIL", f"Trial file {trial_path.name} not found for score-only mode.")
            return
        scene = trial_path.read_text(encoding='utf-8')
        SovereignHUD.log("INFO", f"Loaded existing trial from {trial_path.name}")
    else:
        # Identify participants for the PROLOGUE trial (Phase 8 Focus)
        voices_dir = taliesin.lore_dir / "voices" / "lore" / "characters"
        all_chars = [f.stem for f in voices_dir.glob("*.feature")]
        prologue_chars = [c for c in all_chars if c.lower() in ["matthias", "roan"]]
        
        SovereignHUD.log("INFO", f"Ensemble participants for Phase 8: {', '.join(prologue_chars)}")
        
        SovereignHUD.box_top("Phase 8: The 90% Threshold Trial (EAS & NDS)")
        scene = await taliesin.generate_scene(prologue_chars)
        
        if not scene:
            SovereignHUD.log("FAIL", "Scene generation failed.")
            return
            
        # Save the generated scene
        trial_path.write_text(scene, encoding='utf-8')
        SovereignHUD.log("SUCCESS", f"Trial scene saved to {trial_path.name}")
    
    # Run Cohesion Scoring
    reference_path = taliesin.lore_dir / "Fallows Hallow - TALIESIN.txt"
    baseline_path = taliesin.lore_dir / "baseline.json"
    
    if not reference_path.exists():
        SovereignHUD.log("FAIL", "Reference manuscript not found.")
        return
        
    baseline = {}
    if baseline_path.exists():
        baseline = json.loads(baseline_path.read_text(encoding='utf-8'))
        
    reference = reference_path.read_text(encoding='utf-8')
    SovereignHUD.log("INFO", "Calculating Cohesion Score with EAS/NDS metrics...")
    
    result = await taliesin.calculate_cohesion(scene, reference)
    
    if "error" in result and result["error"] == "Uplink failed":
        SovereignHUD.log("FAIL", f"Cohesion scoring failed: {result.get('message', 'No details available')}")
        return

    SovereignHUD.box_top("Linguistic Cohesion Analysis Results (Phase 8)")
    for key, val in result.items():
        if isinstance(val, dict):
            score = val.get('score', 0)
            base_score = baseline.get('metrics', {}).get(key, 0)
            delta = score - (base_score if base_score else 0)
            delta_str = f" ({'+' if delta >= 0 else ''}{delta})" if base_score else ""
            SovereignHUD.box_row(key.replace('_', ' ').title(), f"{score}%{delta_str} - {val.get('feedback', '')[:100]}...")
        else:
            SovereignHUD.box_row(key.replace('_', ' ').title(), str(val))
            
    # SPRT Check
    current_overall = result.get('overall_score', 0)
    baseline_overall = baseline.get('metrics', {}).get('overall_score', 0)
    forbidden_count = result.get('forbidden_lexeme_count', 0)
    
    if current_overall >= 90:
        SovereignHUD.log("SUCCESS", f"90% THRESHOLD MET: {current_overall}%")
    elif current_overall > baseline_overall:
        SovereignHUD.log("INFO", f"IMPROVEMENT DETECTED: {current_overall}% > {baseline_overall}% (But < 90%)")
    else:
        SovereignHUD.log("WARN", f"SPRT MANDATE FAILED: {current_overall}% <= {baseline_overall}%")
        
    if forbidden_count > 0:
        SovereignHUD.log("WARN", f"FORBIDDEN LEXEMES DETECTED: {forbidden_count}")
    else:
        SovereignHUD.log("SUCCESS", "ZERO FORBIDDEN LEXEMES DETECTED")
        
    SovereignHUD.box_bottom()
    
    if not score_only:
        print("\n--- GENERATED SCENE PREVIEW ---\n")
        print(scene[:1000] + "...")
        print("\n------------------------------\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--score-only", action="store_true")
    args = parser.parse_args()
    asyncio.run(run_loop(score_only=args.score_only))
