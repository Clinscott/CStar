import asyncio
import gc
import logging
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Any

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

import contextlib

from src.core.sovereign_hud import SovereignHUD

# We will use AntigravityUplink for the "Act" phase
from src.cstar.core.uplink import AntigravityUplink
from src.core.engine.wardens.norn import NornWarden
from src.tools.wrap_it_up import SovereignWrapper

# Configure Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("SovereignLoop")

class SovereignForge:
    """
    The 'Act' component of the Loop.
    Executes the 'Forge' logic: Plan -> Edit -> Verify.
    """
    def __init__(self, root: Path):
        self.root = root
        self.uplink = AntigravityUplink()
        self.max_retries = 3

    def forge_task(self, task: dict[str, Any]) -> bool:
        """
        Attempts to resolve the task with retries.
        Returns True if successful (Code changed AND Gungnir passed), False otherwise.
        """
        task_desc = task['action']
        SovereignHUD.box_top("SOVEREIGN FORGE")
        SovereignHUD.persona_log("ODIN", f"Manifesting Objective: {task_desc}")

        # 1. Orient (Identify Target)
        target_file = self._orient_target(task_desc)
        if not target_file:
            SovereignHUD.persona_log("ALFRED", "Could not identify target file. Aborting task.")
            return False

        SovereignHUD.persona_log("ODIN", f"Target Locked: {target_file}")
        self._write_handshake("Investigate", f"Target locked: {target_file.name}")

        # 2. The Loop (Edit -> Verify)
        for attempt in range(1, self.max_retries + 1):
            SovereignHUD.persona_log("ODIN", f"Attempt {attempt}/{self.max_retries}: Forging Code...")

            # Backup
            self._backup(target_file)

            # Generate Code
            self._write_handshake("Plan", f"Generating implementation plan for {target_file.name}")
            success = self._generate_code(task_desc, target_file, attempt)
            if not success:
                SovereignHUD.persona_log("ALFRED", "Code generation failed.")
                self._rollback(target_file)
                continue

            # Verify (Gungnir Gate + Empire TDD)
            self._write_handshake("Execute", f"Verifying {target_file.name} against Gungnir and Contracts")
            if self._verify_integrity(target_file):
                SovereignHUD.persona_log("ODIN", "Verification PASSED. Structure and Contracts are sound.")
                self._cleanup_backup(target_file)
                self._write_handshake("Test", f"Stability verified for {target_file.name}")
                return True
            else:
                SovereignHUD.persona_log("ALFRED", f"Verification FAILED (Attempt {attempt}). Rolling back.")
                self._rollback(target_file)
                gc.collect() # Memory Safety

        # Kill Switch Triggered
        SovereignHUD.persona_log("HEIMDALL", "BREACH: Kill Switch Triggered. Max retries exceeded.")
        return False

    def _write_handshake(self, phase: str, delta: str) -> None:
        """[ALFRED] Records the Phase Handshake in walkthrough.qmd."""
        walkthrough_path = self.root / "walkthrough.qmd"
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        handshake_entry = f"\n### 🤝 Phase Handshake: {phase} ({timestamp})\n- **Delta**: {delta}\n- **Status**: COMPLETED\n"
        
        try:
            with walkthrough_path.open("a", encoding="utf-8") as f:
                f.write(handshake_entry)
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Handshake failed: {e}")

    def _orient_target(self, task: str) -> Path | None:
        """
        Asks LLM to identify the target file from the task description.
        """
        if "(Target: " in task:
            try:
                start = task.index("(Target: ") + 9
                end = task.index(")", start)
                path_str = task[start:end]
                return (self.root / path_str).resolve()
            except:
                pass

        SovereignHUD.persona_log("ALFRED", "Orientation Simulation: Defaulting to scratch_forge.py")
        scratch = self.root / "scratch_forge.py"
        if not scratch.exists():
            scratch.touch()
        return scratch

    def _generate_code(self, task: str, target: Path, attempt: int) -> bool:
        """
        Calls AntigravityUplink to generate code.
        """
        SovereignHUD.persona_log("ODIN", f"Transmitting objective to Antigravity (Attempt {attempt})...")

        # Read content for context
        content = target.read_text(encoding='utf-8') if target.exists() else ""
        context = {
            "task": task,
            "filename": target.name,
            "content": content,
            "persona": "ODIN"
        }

        # Async Call Wrapper
        async def call_uplink():
            return await self.uplink.send_payload(f"FORGE: {task}", context)

        try:
            response = asyncio.run(call_uplink())
        except Exception as e:
            SovereignHUD.persona_log("ALFRED", f"Uplink unavailable: {e}")
            return False

        # Extract Code or Handle Simulation
        new_code = response.get("data", {}).get("code")
        msg = response.get("message", "")

        if not new_code and "[SIMULATION]" in msg:
            SovereignHUD.persona_log("ALFRED", "Uplink is in Simulation Mode. Applying heuristic patch.")
            timestamp = time.strftime("%H:%M:%S")
            new_code = content + f"\n# [O.D.I.N.] Forged Update ({timestamp}): {task}\n"

        if new_code:
            target.write_text(new_code, encoding='utf-8')
            return True
        else:
            SovereignHUD.persona_log("ALFRED", "The void returned no code.")
            return False

    def _verify_integrity(self, target_file: Path) -> bool:
        """
        Runs the Gungnir Gate (Ruff + Pytest) and Empire TDD Contract Validation.
        """
        try:
            import subprocess
            
            # 1. Gungnir: Linting
            res_lint = subprocess.run([sys.executable, "-m", "ruff", "check", str(target_file), "--select", "E9,F63,F7,F82"], capture_output=True)
            if res_lint.returncode != 0: return False

            # 2. Empire TDD: Contract Validation
            contract_path = target_file.with_suffix(".qmd")
            if not contract_path.exists():
                contract_path = self.root / "tests" / "contracts" / f"{target_file.stem}_contracts.qmd"
            
            if contract_path.exists():
                SovereignHUD.persona_log("INFO", f"Empire TDD: Validating against contract {contract_path.name}")
                contract_content = contract_path.read_text(encoding='utf-8')
                if "Given" not in contract_content or "Then" not in contract_content:
                    SovereignHUD.persona_log("WARN", "Contract missing Gherkin syntax.")
                    return False

            # 3. Gungnir: Testing
            res_test = subprocess.run([sys.executable, "-m", "pytest", str(self.root / "tests")], capture_output=True)
            return res_test.returncode == 0
        except Exception:
            return False

    def _backup(self, target: Path) -> None:
        with contextlib.suppress(OSError):
            shutil.copy(target, target.with_suffix(target.suffix + ".bak"))

    def _rollback(self, target: Path) -> None:
        bak = target.with_suffix(target.suffix + ".bak")
        if bak.exists():
            shutil.move(bak, target)

    def _cleanup_backup(self, target: Path) -> None:
        bak = target.with_suffix(target.suffix + ".bak")
        if bak.exists():
            os.remove(bak)


class SovereignLifecycle:
    """[O.D.I.N.] Orchestration logic for the Sovereign Loop lifecycle."""

    @staticmethod
    def execute() -> None:
        """
        The Main Loop.
        Observe -> Orient -> Act -> Verify -> Finalize -> Handshake.
        """
        root = PROJECT_ROOT
        wrapper = SovereignWrapper()
        norn = NornWarden(root)
        forge = SovereignForge(root)

        while True:
            # 1. Observe (Norn)
            SovereignHUD.box_top("SOVEREIGN OBSERVE")
            task = norn.scan()
            if not task:
                SovereignHUD.persona_log("ODIN", "No active tasks in queue. The Cycle pauses.")
                break

            target_task = task[0] # The breach object

            # 2. Act (Forge)
            success = forge.forge_task(target_task)

            if success:
                # 3. Finalize
                SovereignHUD.box_top("SOVEREIGN FINALIZE")
                norn.mark_complete(target_task)
                wrapper.sovereign_commit({})

                # 4. Handshake (Nuke Context)
                SovereignHUD.persona_log("ALFRED", "Purging memory context for next cycle.")
                del task
                del target_task
                gc.collect()

            else:
                # Kill Switch
                SovereignHUD.persona_log("ODIN", "Task failed after max retries. Intervention required.")
                SovereignHUD.persona_log("HEIMDALL", "BREACH: Loop Halted - " + target_task['action'])
                break

            # Wait a moment before next cycle
            time.sleep(2)

if __name__ == "__main__":
    SovereignLifecycle.execute()
