"""
[ENGINE] Skill Forger
Lore: "The Anvil that strikes itself."
Purpose: JIT Generation of Corvus Star Python Skills via AntigravityUplink.
"""

import json
import time
from pathlib import Path
from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink

class SkillForger:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.staging_dir = self.project_root / ".agents" / "skills" / "staging"
        self.staging_dir.mkdir(parents=True, exist_ok=True)
        self.uplink = AntigravityUplink()

    async def sv_forge_skill(self, intent_string: str) -> None:
        """
        Generates a new Python skill dynamically using the Host Agent,
        stages it, and invokes the Sandbox Warden for verification.
        """
        SovereignHUD.persona_log("ODIN", f"Forging JIT Skill for intent: '{intent_string}'")

        prompt = f"""
Generate a Python script for Corvus Star that implements the following intent:
'{intent_string}'

Constraints:
1. Must contain a function `execute(args: list) -> None` as the entry point.
2. Must use `from src.core.sovereign_hud import SovereignHUD` for logging.
3. Output ONLY the raw Python code. Do not use Markdown backticks.
"""
        response = await self.uplink.send_payload(prompt)
        
        if response.get("status") != "success":
            SovereignHUD.persona_log("HEIMDALL", "Forge Failed: Oracle could not generate skill.")
            return

        raw_code = response.get("data", {}).get("raw", "")
        # Fallback to strip markdown if the agent ignored instructions
        if "```python" in raw_code:
            raw_code = raw_code.split("```python")[1].split("```")[0].strip()
        elif "```" in raw_code:
            raw_code = raw_code.split("```")[1].split("```")[0].strip()

        timestamp = int(time.time())
        skill_name = f"jit_skill_{timestamp}.py"
        staged_path = self.staging_dir / skill_name
        
        with staged_path.open("w", encoding="utf-8") as f:
            f.write(raw_code)
            
        SovereignHUD.persona_log("ALFRED", f"Skill forged and staged at {staged_path.relative_to(self.project_root)}")

        # Step 3/4: Pass to Sandbox Warden for execution and verification
        from src.sentinel.wardens.sandbox_warden import SandboxWarden
        warden = SandboxWarden(self.project_root)
        success = warden.execute_and_verify(staged_path)
        
        if success:
            SovereignHUD.persona_log("ODIN", "JIT Skill verified and patched. Promotion complete.")
        else:
            SovereignHUD.persona_log("HEIMDALL", "JIT Skill failed Sandbox verification. Discarding.")
