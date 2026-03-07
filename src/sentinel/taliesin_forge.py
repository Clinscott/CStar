"""
[SPOKE] Taliesin Forge (The Living Lore Compiler)
Lore: "When the Bard sings, the world shifts to match the melody."
Purpose: Translates Gherkin .feature contracts and .qmd Campaigns directly into structural code artifacts.
"""

import asyncio
import json
import os
import sys
import re
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[2]
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink

def extract_json(text: str) -> dict:
    """Robustly extracts JSON from LLM output, handling markdown blocks and noise."""
    try:
        # Try to find JSON block
        match = re.search(r'```json\s*(\{.*?\})\s*```', text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        
        # Try to find balanced braces
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            return json.loads(text[start:end+1])
            
        return json.loads(text)
    except Exception:
        raise ValueError("Could not extract valid JSON from response.")

class TaliesinForge:
    """
    [Ω] The Forge of the Bard.
    Automates the materialization of code from structured repository lore.
    """
    def __init__(self, root_path: Path):
        self.root = root_path
        self.uplink = AntigravityUplink()
        self.staged_dir = self.root / ".agent" / "forge_staged"
        self.staged_dir.mkdir(parents=True, exist_ok=True)
        
    async def weave_code_from_lore(self, lore_file_path: Path) -> bool:
        """
        [🔱] Weave the Lore into the Matrix.
        Translates intent into infrastructure.
        """
        SovereignHUD.log("INFO", f"Taliesin Forge igniting for: {lore_file_path.name}")
        
        if not lore_file_path.exists():
            SovereignHUD.log("FAIL", f"Lore file not found: {lore_file_path}")
            return False
            
        content = lore_file_path.read_text(encoding='utf-8')
        
        prompt = (
            "ACT AS: The Taliesin Forge Architect.\n"
            "MANDATE: Translate the following Lore Fragment into a production-ready Code Artifact.\n\n"
            f"LORE FRAGMENT:\n```\n{content}\n```\n\n"
            "CONSTRAINTS:\n"
            "1. Output MUST be a valid JSON object.\n"
            "2. Fields: 'target_path' (relative to root) and 'code' (full file content).\n"
            "3. Follow the Linscott Standard: Strict typing, comprehensive docstrings.\n"
            "4. Language: Match the project's stack (Python or TypeScript)."
        )
        
        SovereignHUD.log("ALFRED", "Consulting the One Mind...")
        
        # Requesting 3 flash preview for high-fidelity agentic drafting
        response = await self.uplink.send_payload(prompt, {
            "persona": "TALIESIN", 
            "model": "gemini-3-flash-preview",
            "system_prompt": "Output ONLY valid JSON."
        })
        
        if response.get("status") == "success":
            raw_output = response.get("data", {}).get("raw", "")
            try:
                data = extract_json(raw_output)
                target_rel_path = data.get("target_path")
                code_content = data.get("code")
                
                if not target_rel_path or not code_content:
                    raise ValueError("Incomplete Forge payload.")
                    
                # Stage the artifact
                stage_path = self.staged_dir / Path(target_rel_path).name
                stage_path.write_text(code_content, encoding='utf-8')
                
                SovereignHUD.log("SUCCESS", f"Artifact forged: {target_rel_path}")
                return True
                
            except Exception as e:
                SovereignHUD.log("ERROR", f"Forge materialization failed: {e}")
                return False
        else:
            SovereignHUD.log("FAIL", f"The Forge was extinguished: {response.get('message')}")
            return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python taliesin_forge.py <lore_file>")
        sys.exit(1)
        
    target_lore = Path(sys.argv[1])
    forge = TaliesinForge(project_root)
    asyncio.run(forge.weave_code_from_lore(target_lore))
