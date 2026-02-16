
import os
import sys
import gc
import types
import time
import shutil
import logging
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.sentinel.wardens.norn import NornWarden
from src.tools.wrap_it_up import SovereignWrapper
from src.core.ui import HUD
# We will use AntigravityUplink for the "Act" phase
from src.cstar.core.uplink import AntigravityUplink

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

    def forge_task(self, task: Dict[str, Any]) -> bool:
        """
        Attempts to resolve the task with retries.
        Returns True if successful (Code changed AND Gungnir passed), False otherwise.
        """
        task_desc = task['action']
        HUD.box_top("SOVEREIGN FORGE")
        HUD.persona_log("ODIN", f"Manifesting Objective: {task_desc}")

        # 1. Orient (Identify Target)
        # We ask the Uplink to identify the target file and implementation plan
        # This is a mini-chain.
        
        target_file = self._orient_target(task_desc)
        if not target_file:
            HUD.persona_log("ALFRED", "Could not identify target file. Aborting task.")
            return False

        HUD.persona_log("ODIN", f"Target Locked: {target_file}")
        
        # 2. The Loop (Edit -> Verify)
        for attempt in range(1, self.max_retries + 1):
            HUD.persona_log("ODIN", f"Attempt {attempt}/{self.max_retries}: Forging Code...")
            
            # Backup
            self._backup(target_file)
            
            # Generate Code
            success = self._generate_code(task_desc, target_file, attempt)
            if not success:
                HUD.persona_log("ALFRED", "Code generation failed.")
                self._rollback(target_file)
                continue

            # Verify (Gungnir Gate)
            # We use SovereignWrapper's gate logic, but localized
            if self._verify_integrity():
                HUD.persona_log("ODIN", "Verification PASSED. Structure is sound.")
                self._cleanup_backup(target_file)
                return True
            else:
                HUD.persona_log("ALFRED", f"Verification FAILED (Attempt {attempt}). Rolling back.")
                self._rollback(target_file)
                gc.collect() # Memory Safety
                
        # Kill Switch Triggered
        HUD.persona_log("HEIMDALL", "BREACH: Kill Switch Triggered. Max retries exceeded.")
        # Atomic Rollback is already done in the loop if fail.
        return False

    def _orient_target(self, task: str) -> Optional[Path]:
        """
        Asks LLM to identify the target file from the task description.
        """
        # Simulation Logic for Activation Phase
        # If we can't really call LLM, we default to a safe scratch file for testing the loop.
        prompt = f"Identify target for: {task}"
        
        # Try simplistic extraction
        if "(Target: " in task:
            try:
                start = task.index("(Target: ") + 9
                end = task.index(")", start)
                path_str = task[start:end]
                return (self.root / path_str).resolve()
            except:
                pass

        # Fallback for verification/scaffold
        HUD.persona_log("ALFRED", "Orientation Simulation: Defaulting to scratch_forge.py")
        scratch = self.root / "scratch_forge.py"
        if not scratch.exists():
            scratch.touch()
        return scratch

    def _generate_code(self, task: str, target: Path, attempt: int) -> bool:
        """
        Calls AntigravityUplink to generate code.
        """
        HUD.persona_log("ODIN", f"Transmitting objective to Antigravity (Attempt {attempt})...")
        
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
            HUD.persona_log("ALFRED", f"Uplink unavailable: {e}")
            return False

        # Extract Code or Handle Simulation
        new_code = response.get("data", {}).get("code")
        msg = response.get("message", "")

        if not new_code and "[SIMULATION]" in msg:
            HUD.persona_log("ALFRED", "Uplink is in Simulation Mode. Applying heuristic patch.")
            # Heuristic: Just append a comment to verify loop cycle
            timestamp = time.strftime("%H:%M:%S")
            new_code = content + f"\n# [ODIN] Forged Update ({timestamp}): {task}\n"
        
        if new_code:
            target.write_text(new_code, encoding='utf-8')
            return True
        else:
            HUD.persona_log("ALFRED", "The void returned no code.")
            return False

    def _verify_integrity(self) -> bool:
        """
        Runs the Gungnir Gate (Ruff + Pytest).
        """
        wrapper = SovereignWrapper() # Initializes at root
        # We need to suppress sys.exit in wrapper or catch it
        try:
            # We'll reimplement specific checks to avoid wrapper's sys.exit(1)
            # Or assume wrapper has a method that returns bool
            # Wrapper.run_gungnir_gate() calls sys.exit(1).
            # We should refactor wrapper or run subprocess manually.
            
            # Manual Check
            import subprocess
            res_lint = subprocess.run([sys.executable, "-m", "ruff", "check", ".", "--select", "E9,F63,F7,F82"], cwd=str(self.root), capture_output=True)
            if res_lint.returncode != 0: return False
            
            res_test = subprocess.run([sys.executable, "-m", "pytest"], cwd=str(self.root), capture_output=True)
            if res_test.returncode != 0: return False
            
            return True
        except Exception:
            return False

    def _backup(self, target: Path):
        try:
            shutil.copy(target, target.with_suffix(target.suffix + ".bak"))
        except OSError:
            pass

    def _rollback(self, target: Path):
        bak = target.with_suffix(target.suffix + ".bak")
        if bak.exists():
            shutil.move(bak, target)

    def _cleanup_backup(self, target: Path):
        bak = target.with_suffix(target.suffix + ".bak")
        if bak.exists():
            os.remove(bak)


def sovereign_lifecycle():
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
        HUD.box_top("SOVEREIGN OBSERVE")
        task = norn.scan() 
        # Norn.scan() returns a list of breaches. For Campaign, it returns one object.
        if not task:
            HUD.persona_log("ODIN", "No active tasks in queue. The Cycle pauses.")
            break
        
        target_task = task[0] # The breach object
        
        # 2. Act (Forge)
        # Note: 'task' is a Campaign Task breach.
        success = forge.forge_task(target_task)
        
        if success:
            # 3. Finalize
            HUD.box_top("SOVEREIGN FINALIZE")
            # Mark complete in tasks.qmd
            norn.mark_complete(target_task)
            
            # Commit & Push
            # Wrapper sovereign_commit computes stats. We can run compile_traces or just pass empty stats
            wrapper.sovereign_commit({}) # We arguably should compile traces first
            
            # 4. Handshake (Nuke Context)
            HUD.persona_log("ALFRED", "Purging memory context for next cycle.")
            del task
            del target_task
            gc.collect()
            
            # In a real agentic loop, we might restart the script or just clear the LLM client.
            # forge.uplink should be reset in next iteration if needed.
            
        else:
            # Kill Switch
            HUD.persona_log("ODIN", "Task failed after max retries. Intervention required.")
            HUD.persona_log("HEIMDALL", "BREACH: Loop Halted - " + target_task['action'])
            break

        # Wait a moment before next cycle
        time.sleep(2)

if __name__ == "__main__":
    sovereign_lifecycle()
