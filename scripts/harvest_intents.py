import os
import json
import asyncio
import sys
from pathlib import Path
from typing import Any, List, Dict

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.cstar.core.uplink import AntigravityUplink
from src.core.sovereign_hud import SovereignHUD

class IntentHarvester:
    """
    [Ω] The Harvester (v2.0).
    Uses a robust multi-pass strategy to generate live test cases.
    """
    def __init__(self, target_n: int = 20): # Reduced for reliability
        self.target_n = target_n
        self.skills_dir = PROJECT_ROOT / ".agents" / "skills"
        self.workflow_dir = PROJECT_ROOT / ".agents" / "workflows"
        self.output_file = PROJECT_ROOT / "fishtest_live.json"

    def _get_skill_inventory(self) -> List[str]:
        inventory = []
        for f in self.workflow_dir.glob("*.md"): inventory.append(f"/{f.stem}")
        for f in self.workflow_dir.glob("*.qmd"): inventory.append(f"/{f.stem}")
        for d in self.skills_dir.iterdir():
            if d.is_dir() and (d / "SKILL.md").exists(): inventory.append(d.name)
        return inventory

    async def harvest(self):
        SovereignHUD.persona_log("INFO", "Harvester: Identifying live skills...")
        inventory = self._get_skill_inventory()
        
        SovereignHUD.persona_log("INFO", f"Harvester: Found {len(inventory)} skills. Generating cases...")
        
        # [Ω] ROBUST PASS: One by one or in small batches
        test_cases = []
        
        # 1. Manual Seed Cases (Guaranteed Signal)
        seeds = [
            {"query": "reboot the catalog", "expected": "/lets-go"},
            {"query": "start creating the site", "expected": "/lets-go"},
            {"query": "begin implementation of checkout", "expected": "/lets-go"},
            {"query": "debug the auth failure", "expected": "/investigate"},
            {"query": "analyze the system latency", "expected": "/investigate"},
            {"query": "check for security leaks", "expected": "/investigate"},
            {"query": "generate the checkout logic", "expected": "/run-task"},
            {"query": "build the login component", "expected": "/run-task"},
            {"query": "implement the nav bar", "expected": "/run-task"},
            {"query": "finish implementation and commit", "expected": "/wrap-it-up"},
            {"query": "call it a day", "expected": "/wrap-it-up"},
            {"query": "finalize session", "expected": "/wrap-it-up"},
            {"query": "run the full suite", "expected": "/test"},
            {"query": "verify the integrity", "expected": "/test"},
            {"query": "benchmark the engine", "expected": "/test"},
            {"query": "draft a strategy for the store", "expected": "/plan"},
            {"query": "architect the database", "expected": "/plan"},
            {"query": "blueprint the visuals", "expected": "/plan"},
            {"query": "show me the matrix", "expected": "pennyone"},
            {"query": "visualize the code", "expected": "pennyone"}
        ]
        test_cases.extend(seeds)

        # 2. Oracle Generation
        skill_subset = inventory[:10] # Just the first few for this pass
        prompt = f"""
        Generate {self.target_n} realistic user queries for these skills: {', '.join(skill_subset)}.
        Format your response as a simple JSON list of objects:
        [
          {{"query": "example user query", "expected": "skill_trigger"}}
        ]
        Return ONLY the JSON.
        """
        
        try:
            response_dict = await AntigravityUplink.query_bridge(prompt)
            raw_text = response_dict.get("data", {}).get("raw", "[]")
            
            import re
            json_match = re.search(r'\[.*\]', raw_text, re.DOTALL)
            if json_match:
                gen_cases = json.loads(json_match.group(0))
                test_cases.extend(gen_cases)
            
            # Final Enrichment
            for case in test_cases:
                case["min_score"] = 0.8
                case["expected_mode"] = "neural"
                case["tags"] = ["live", "synthetic"]
                
            final_data = {"test_cases": test_cases}
            self.output_file.write_text(json.dumps(final_data, indent=2))
            SovereignHUD.persona_log("SUCCESS", f"Harvester: {len(test_cases)} cases crystallized.")
            
        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Harvester failure: {e}")

if __name__ == "__main__":
    harvester = IntentHarvester()
    asyncio.run(harvester.harvest())
