"""
[SPOKE] Muninn Crucible
Lore: "The Anvil of Odin."
Purpose: Forging reproduction tests, generating fixes, and verifying candidates in the Crucible.
"""

import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from src.core.sovereign_hud import SovereignHUD
from src.sentinel.code_sanitizer import BifrostGate


class MuninnCrucible:
    def __init__(self, root: Path, uplink: Any):
        self.root = root
        self.uplink = uplink
        self.gate = BifrostGate(root)

    async def generate_gauntlet(self, target: dict, code: str) -> Path | None:
        """Creates a pytest reproduction for the identified breach."""
        justification = target.get("action") or target.get("justification") or "Improve code quality"
        prompt = (
            f"Generate a pytest reproduction test for the following issue in {target['file']}: {justification}.\n"
            f"DO NOT USE ANY TOOLS. DO NOT CALL ANY FUNCTIONS OTHER THAN THE CODE PROVIDED.\n"
            f"Respond ONLY with a JSON object containing the 'code' key with the python test content.\n"
            f"The test MUST fail on the current code and pass once the issue is fixed.\n"
            f"Code:\n{code}"
        )
        SovereignHUD.persona_log("INFO", "Contacting the High Seat for Gauntlet blueprints...")
        
        res = await self.uplink.send_payload(prompt, {"persona": "ALFRED"})
        if res.get("status") != "success":
            return None
        
        raw_code = res["data"].get("code") or res["data"].get("raw", "")
        clean_test = self.gate.sanitize_test(raw_code, target["file"])
        
        test_file = self.root / "tests" / "gauntlet" / f"test_{int(time.time())}.py"
        test_file.parent.mkdir(parents=True, exist_ok=True)
        test_file.write_text(clean_test, encoding="utf-8")
        
        SovereignHUD.persona_log("SUCCESS", f"Gauntlet forged at {test_file.name}")
        return test_file

    async def generate_steel(self, target: dict, code: str, test_path: Path) -> str | None:
        """Generates the code fix (Steel) based on the gauntlet failure."""
        test_code = test_path.read_text(encoding="utf-8")
        justification = target.get("action") or target.get("justification") or "Improve code quality"
        prompt = (
            f"Fix the following issue: {justification}. File: {target['file']}.\n"
            f"DO NOT USE ANY TOOLS. Respond ONLY with a JSON object containing the 'code' key with the fixed python code.\n"
            f"Code:\n{code}\nReproduction Test:\n{test_code}"
        )
        
        SovereignHUD.persona_log("INFO", "Consulting Mimir for the Steel formula...")
        res = await self.uplink.send_payload(prompt, {"persona": "ODIN"})
        if res.get("status") != "success":
            return None
            
        raw_code = res["data"].get("code") or res["data"].get("raw", "")
        SovereignHUD.persona_log("SUCCESS", "Steel formula received.")
        return self.gate.sanitize_code(raw_code)

    def verify_fix(self, test_path: Path) -> bool:
        """Executes the gauntlet tests in the Crucible with a strict timeout."""
        SovereignHUD.persona_log("INFO", f"Entering the Crucible for verification: {test_path.name}")
        cmd = [sys.executable, "-m", "pytest", str(test_path), "-v"]
        
        try:
            # 120s timeout for unit verification to prevent hangs
            result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=120)
            
            if result.returncode == 0:
                SovereignHUD.persona_log("SUCCESS", "The Crucible is satisfied. Fix verified.")
                return True
            else:
                SovereignHUD.persona_log("ERROR", f"Crucible Failure:\n{result.stdout}\n{result.stderr}")
                return False
        except subprocess.TimeoutExpired:
            SovereignHUD.persona_log("ERROR", "Crucible Timeout: Verification stalled.")
            return False

    def apply_fix(self, file_path: Path, new_content: str):
        """Applies the forged fix to the target file and creates a backup."""
        if file_path.exists():
            shutil.copy(file_path, str(file_path) + ".bak")
        file_path.write_text(new_content, encoding="utf-8")

    def rollback(self, file_path: Path):
        """Restores the file from backup if verification fails."""
        bak_path = Path(str(file_path) + ".bak")
        if bak_path.exists():
            SovereignHUD.persona_log("INFO", f"Rolling back changes for {file_path.name}...")
            shutil.copy(bak_path, file_path)
            bak_path.unlink()
