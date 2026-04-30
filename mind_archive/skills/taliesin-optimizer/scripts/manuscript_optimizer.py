import asyncio
import sys
import re
import json
import time
from pathlib import Path
from typing import Any, Dict, List

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink

class ManuscriptOptimizer:
    """
    [Ω] Karpathy Auto-Researcher Loop for Global Manuscript Optimization.
    Identity: TALIESIN / O.D.I.N.
    Mandate: HOST-NATIVE FIRST.
    Purpose: Establish a Global Golden Baseline and improve segments across 4 axes with 90% fidelity.
    """

    RUBRIC = {
        "writing_skill": "Vocabulary variance, sentence rhythm, sensory density, and linguistic resonance.",
        "entertainment_value": "Pacing, emotional weight, narrative hook strength, and reader engagement.",
        "plot_devices": "Foreshadowing, stakes, agency, and structural pay-offs.",
        "story_coherence": "Logical flow, character consistency, world-building alignment, and internal logic."
    }

    MIN_FIDELITY = 90.0 # THE SUPREME FIDELITY FLOOR

    def __init__(self, root_path: Path):
        self.root = root_path
        self.uplink = AntigravityUplink()
        self.manuscript_path = self.root / ".lore" / "samples" / "Fallows Hallow - TALIESIN.txt"
        self.output_dir = self.root / ".lore" / "optimized"
        self.config_dir = self.root / ".agents" / "state" / "taliesin"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        self.global_baseline_path = self.config_dir / "global_golden_baseline.json"

    def extract_segment(self, segment_name: str) -> str:
        """Robustly extracts a chapter or prologue from the original manuscript, skipping TOC."""
        if not self.manuscript_path.exists():
            raise FileNotFoundError(f"Manuscript not found at {self.manuscript_path}")
        
        content = self.manuscript_path.read_text(encoding='utf-8', errors='ignore')
        lines = content.splitlines()
        
        target = segment_name.upper().strip()
        start_idx = -1
        
        SovereignHUD.log("INFO", f"Extracting {target}...")

        # Skip TOC and search for centered body headers
        for i in range(30, len(lines)):
            line = lines[i].strip().upper()
            if target == line or (target in line and len(line) < 50):
                if "---" in line or "===" in line: continue
                if i > 0 and i < len(lines)-1:
                    above = lines[i-1].strip()
                    below = lines[i+1].strip()
                    if ("===" in above or "---" in above) and ("===" in below or "---" in below):
                        start_idx = i + 2 
                        break
        
        if start_idx == -1:
            for i in range(30, len(lines)):
                if lines[i].strip().upper() == target and "---" not in lines[i]:
                    start_idx = i + 1
                    break

        if start_idx == -1: return ""
            
        end_idx = len(lines)
        for i in range(start_idx, len(lines)):
            line = lines[i].strip().upper()
            if ("CHAPTER" in line or "PROLOGUE" in line or "EPILOGUE" in line or "BOOK OF" in line or "VISITOR" in line) and len(line) < 50:
                if "---" in line or "===" in line:
                    end_idx = i
                    break
                if i > 0 and ("===" in lines[i-1] or "---" in lines[i-1]):
                    end_idx = i - 1
                    break
                    
        text = "\n".join(lines[start_idx:end_idx]).strip()
        return text.replace("<$p>", "").strip()

    async def establish_global_baseline(self) -> Dict[str, Any]:
        """Samples the entire manuscript to establish a single, Golden Baseline and Voice Signature."""
        SovereignHUD.box_top("🔱 ESTABLISHING GLOBAL GOLDEN BASELINE")
        
        content = self.manuscript_path.read_text(encoding='utf-8', errors='ignore')
        lines = content.splitlines()
        total_lines = len(lines)
        
        sample_size = 100
        samples = [
            "\n".join(lines[100:100+sample_size]),
            "\n".join(lines[total_lines//2 : total_lines//2 + sample_size]),
            "\n".join(lines[total_lines-sample_size : total_lines])
        ]
        global_text = "\n\n--- MANUSCRIPT CROSS-SECTION ---\n\n".join(samples)
        
        prompt = (
            "You are the Sovereign Manuscript Auditor. Establish a GLOBAL GOLDEN BASELINE for 'Fallows Hallow'.\n\n"
            f"SAMPLES:\n```text\n{global_text[:10000]}\n```\n\n"
            "Output JSON: {\"writing_skill\": score, \"entertainment_value\": score, \"plot_devices\": score, \"story_coherence\": score, \"voice_signature\": \"...\", \"core_themes\": \"...\", \"overall_feedback\": \"...\"}"
        )

        response = await self._secure_request(prompt, persona="ODIN", model="gemini-2.0-flash")
        if response:
            data = self._parse_oracle_json(response)
            if data:
                data["timestamp"] = time.time()
                self.global_baseline_path.write_text(json.dumps(data, indent=2), encoding='utf-8')
                SovereignHUD.log("SUCCESS", "Global Golden Baseline anchored.")
                return data
        return {}

    async def _secure_request(self, prompt: str, persona: str, model: str) -> str | None:
        """Execute request with multiple retries and hud logging."""
        for attempt in range(4):
            try:
                response = await self.uplink.send_payload(prompt, {"persona": persona, "model": model})
                if response.get("status") == "success":
                    return response.get("data", {}).get("raw", "")
                SovereignHUD.log("WARN", f"Uplink attempt {attempt+1} failed: {response.get('message')}")
            except Exception as e:
                SovereignHUD.log("WARN", f"Uplink attempt {attempt+1} error: {str(e)}")
            
            if attempt < 3:
                await asyncio.sleep(5)
        return None

    def _parse_oracle_json(self, raw: str) -> Dict[str, Any] | None:
        """Robustly extracts JSON from raw LLM output."""
        json_match = re.search(r"(\{.*\})", raw, re.DOTALL)
        if json_match:
            try: return json.loads(json_match.group(1))
            except: pass
            
        scores = {}
        for key in ["writing_skill", "entertainment_value", "plot_devices", "story_coherence", "fidelity_score"]:
            match = re.search(rf'"{key}"\s*:\s*([\d.]+)', raw)
            if match: scores[key] = float(match.group(1))
        
        if scores:
            fb_match = re.search(rf'"feedback"\s*:\s*"(.*?)"', raw)
            scores["feedback"] = fb_match.group(1) if fb_match else "Extracted via regex."
            return scores
        return None

    async def run_chapter_loop(self, chapter_name: str, iterations: int = 3):
        """Runs the Karpathy Loop on a chapter relative to the Global Baseline."""
        if not self.global_baseline_path.exists():
            await self.establish_global_baseline()
            
        global_baseline = json.loads(self.global_baseline_path.read_text(encoding='utf-8'))
        
        SovereignHUD.box_top(f"🧬 OPTIMIZING: {chapter_name}")
        
        prose = self.extract_segment(chapter_name)
        if not prose:
            SovereignHUD.log("FAIL", f"Could not extract {chapter_name}")
            return

        SovereignHUD.log("INFO", "Establishing Local Baseline...")
        current_best_audit = await self.grade_relative_to_global(prose, global_baseline)
        current_best_prose = prose
        
        self.print_audit("LOCAL BASELINE", current_best_audit)

        for i in range(1, iterations + 1):
            SovereignHUD.log("INFO", f"--- ITERATION {i} ---")
            
            mutated = await self.mutate_text(current_best_prose, current_best_audit, global_baseline)
            if not mutated: continue
            
            new_audit = await self.grade_relative_to_global(mutated, global_baseline, original_text=prose)
            
            fidelity = new_audit.get("fidelity_score", 0)
            valid_keys = [k for k in self.RUBRIC if k in new_audit]
            avg = sum(new_audit[k] for k in valid_keys) / len(valid_keys) if valid_keys else 0
            
            best_keys = [k for k in self.RUBRIC if k in current_best_audit]
            best_avg = sum(current_best_audit[k] for k in best_keys) / len(best_keys) if best_keys else 0
            
            SovereignHUD.log("INFO", f"Fidelity: {fidelity}% | Avg: {avg:.1f} (Best: {best_avg:.1f})")
            
            if fidelity < self.MIN_FIDELITY:
                SovereignHUD.log("WARN", f"Mutation Rejected: Fidelity floor breach ({fidelity}%)")
                continue
            
            if avg > best_avg:
                SovereignHUD.log("SUCCESS", f"Improvement Adopted! (+{avg-best_avg:.1f})")
                current_best_prose = mutated
                current_best_audit = new_audit
            else:
                SovereignHUD.log("INFO", "No improvement.")

        out_path = self.output_dir / f"{chapter_name.lower().replace(' ', '_')}.md"
        out_path.write_text(current_best_prose, encoding='utf-8')
        SovereignHUD.log("SUCCESS", f"Chapter crystallized at {out_path.name}")
        self.print_audit("FINAL AUDIT", current_best_audit)
        SovereignHUD.box_bottom()

    async def grade_relative_to_global(self, text: str, global_baseline: Dict[str, Any], original_text: str = None) -> Dict[str, Any]:
        """Grades a segment using the Global Baseline as the fixed standard."""
        sampled_text = text[:3000]
        
        prompt = (
            "Grade this chapter segment relative to the GLOBAL GOLDEN BASELINE.\n\n"
            f"GLOBAL RUBRIC:\n{json.dumps(global_baseline, indent=2)}\n\n"
            f"PROSE TO GRADE:\n```text\n{sampled_text}\n```\n\n"
        )
        
        if original_text:
            prompt += f"ORIGINAL AUTHOR PROSE (Maintain 90%+ Fidelity):\n```text\n{original_text[:1500]}\n```\n\n"

        prompt += "Output ONLY JSON: {\"writing_skill\": score, \"entertainment_value\": score, \"plot_devices\": score, \"story_coherence\": score, \"fidelity_score\": score, \"feedback\": \"...\"}"

        raw = await self._secure_request(prompt, persona="ODIN", model="gemini-1.5-flash")
        if raw:
            data = self._parse_oracle_json(raw)
            if data: return data
            
        return {"writing_skill": 0, "entertainment_value": 0, "plot_devices": 0, "story_coherence": 0, "fidelity_score": 0, "feedback": "Grade failure."}

    async def mutate_text(self, text: str, audit: Dict[str, Any], global_baseline: Dict[str, Any]) -> str:
        """Mutates text to elevate lowest axis toward Global Golden standard."""
        axes = {k: v for k, v in audit.items() if k in self.RUBRIC}
        lowest = min(axes, key=axes.get) if axes else "writing_skill"
        
        prompt = (
            "You are the Taliesin Master Bard. Elevate this chapter segment.\n\n"
            f"VOICE DNA: {global_baseline.get('voice_signature')}\n"
            f"THEMES: {global_baseline.get('core_themes')}\n\n"
            f"CURRENT PROSE:\n{text[:4000]}\n\n"
            f"TARGET FOCUS: Improve '{lowest}' axis (currently {axes.get(lowest)}/100).\n\n"
            "MANDATE: Output ONLY the improved prose. Maintain 90%+ fidelity to original story."
        )

        return await self._secure_request(prompt, persona="TALIESIN", model="gemini-1.5-flash") or text

    def print_audit(self, title: str, audit: Dict[str, Any]):
        print(f"\n[🔱] {title}")
        for key in self.RUBRIC:
            score = audit.get(key, 0)
            print(f"  ◈ {key.replace('_', ' ').title():<20}: {score}%")
        print(f"  ◈ Fidelity Floor Check  : {audit.get('fidelity_score', 100)}%")
        print(f"  ◈ Analysis: {str(audit.get('feedback', 'No feedback.'))[:150]}...\n")

async def main():
    import argparse
    parser = argparse.ArgumentParser(description="Global Manuscript Optimizer")
    parser.add_argument("--chapter", type=str, default="Prophecy", help="Chapter to optimize")
    parser.add_argument("--baseline", action="store_true", help="Force re-establishment of Global Baseline")
    parser.add_argument("--iterations", type=int, default=3, help="Loop iterations")
    
    args = parser.parse_args()
    optimizer = ManuscriptOptimizer(PROJECT_ROOT)
    
    if args.baseline or not optimizer.global_baseline_path.exists():
        await optimizer.establish_global_baseline()
        
    if not args.baseline:
        await optimizer.run_chapter_loop(args.chapter, args.iterations)

if __name__ == "__main__":
    asyncio.run(main())
