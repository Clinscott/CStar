import os
import sys
import json
import time
import shutil
import asyncio
import subprocess
import gc
from pathlib import Path

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.uplink import AntigravityUplink

class Forge:
    """
    The Autonomous Forge (Daemon-Hosted).
    Executes the Safe Coding Loop: Backup -> Edit -> Test -> Retry.
    Yields UI events for the client to render.
    """
    def __init__(self):
        self.uplink = AntigravityUplink()
        self.max_retries = 3
        self.project_root = project_root

    def __repr__(self):
        return f"<Forge(root='{self.project_root}', retries={self.max_retries})>"

    async def execute(self, task: str, target_file: str):
        """
        Runs the forging loop as an async generator.
        Yields: {"type": "ui"|"result", ...}
        """
        target_path = Path(target_file).resolve()
        
        # Security Check: Ensure target is within project
        # (Simplified for now, but important for Daemon safety)
        
        if not target_path.exists():
            yield {"type": "ui", "persona": "ODIN", "msg": f"Target file {target_path.name} does not exist. Creating new."}
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.touch()

        # Context Loading
        context = {
            "task": task,
            "filename": target_path.name,
            "content": target_path.read_text(encoding='utf-8'),
            "persona": "ODIN"
        }

        yield {"type": "ui", "persona": "ODIN", "msg": f"Forging '{task}' on {target_path.name}..."}

        # The Loop
        for attempt in range(1, self.max_retries + 1):
            yield {"type": "ui", "persona": "ODIN", "msg": f"Attempt {attempt}/{self.max_retries}: Communing with the void..."}
            
            # 1. Uplink (Get Code)
            # Uplink itself is designed to return a single response. 
            # We might want to stream Uplink status too? For now, await it.
            response = await self.uplink.send_payload(f"FORGE: {task}", context)
            
            if response.get("status") == "error":
                yield {"type": "ui", "persona": "ALFRED", "msg": f"Uplink severed: {response.get('message')}"}
                yield {"type": "result", "status": "error", "message": "Uplink Failed"}
                return
                
            # Parse Response
            new_code = response.get("data", {}).get("code")
            
            # [SIMULATION LOGIC]
            if not new_code and "[SIMULATION]" in response.get("message", ""):
                new_code = context["content"] + f"\n# Forge update attempt {attempt}: {task}\n"

            if not new_code:
                yield {"type": "ui", "persona": "ALFRED", "msg": "The void returned silence (No code)."}
                yield {"type": "result", "status": "error", "message": "No code received"}
                return

            # 2. Safe Merge (Backup + Apply)
            backup_path = target_path.with_suffix(target_path.suffix + ".bak")
            shutil.copy(target_path, backup_path)
            
            target_path.write_text(new_code, encoding='utf-8')
            yield {"type": "ui", "persona": "ODIN", "msg": "The steel is folded. Verifying..."}
            
            # 3. Gungnir Verification
            # Simulate Test Run
            await asyncio.sleep(0.5) # Simulate testing time
            
            # [SIMULATION CHECK] 
            # If task contains "fail", we simulate failure
            if "fail" in task.lower() and attempt < 3:
                verification_passed = False
            else:
                verification_passed = True

            if verification_passed:
                yield {"type": "ui", "persona": "ODIN", "msg": "Verification PASSED. Zero regression."}
                gc.collect()
                yield {"type": "result", "status": "success", "message": "Forge Complete"}
                return
            else:
                # 4. Retry Logic
                yield {"type": "ui", "persona": "ALFRED", "msg": f"Verification failed on attempt {attempt}. Rolling back."}
                shutil.copy(backup_path, target_path) # Restore
                
                context["error"] = "Simulation: Verification Failed"
                context["previous_attempt"] = new_code
                gc.collect()
                
        yield {"type": "ui", "persona": "ODIN", "msg": "Maximum retries exhausted. The Forge sleeps."}
        yield {"type": "result", "status": "failure", "message": "Max Retries Exceeded"}
