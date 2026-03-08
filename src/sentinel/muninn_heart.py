"""
[SPOKE] Muninn Heart
Lore: "The Pulse of the Raven."
Purpose: Lifecycle management, process synchronization, and autonomous loop execution.
"""

import asyncio
import os
import time
from pathlib import Path
from typing import Any

from src.core.sovereign_hud import SovereignHUD
from src.core.metrics import ProjectMetricsEngine
from src.sentinel.stability import TheWatcher
from src.sentinel.muninn_crucible import MuninnCrucible
from src.sentinel.muninn_memory import MuninnMemory
from src.core.mimir_client import mimir
from src.sentinel.coordinator import MissionCoordinator


class MuninnHeart:
    """
    [Ω] The Pulse of Muninn.
    Orchestrates the Hunt -> Forge -> Crucible cycle with endurance hardening.
    Mandate: One Mind. No 'Too Much Mind'.
    """
    def __init__(self, root: Path, uplink: Any):
        self.root = root
        self.uplink = uplink
        self.pid_file = self.root / ".agents" / "muninn.pid"
        self.metrics_engine = ProjectMetricsEngine()
        self.watcher = TheWatcher(self.root)
        self.memory = MuninnMemory(self.root)
        self.coordinator = MissionCoordinator(self.root)
        self.crucible = MuninnCrucible(self.root, self.uplink)
        
        # Endurance Metrics
        self.start_time = time.time()
        self.cycle_count = 0
        self.total_errors = 0

    def _wait_for_silence(self):
        """Wait for 5 minutes of repository silence before taking flight."""
        if os.getenv("MUNINN_FORCE_FLIGHT") == "true":
            SovereignHUD.persona_log("INFO", "Silence Protocol bypassed by Master's Decree.")
            return

        last_edit = self.watcher.get_last_edit_time()
        while time.time() - last_edit < 300:
            SovereignHUD.persona_log("INFO", "Muninn is observing the matrix, waiting for silence...")
            time.sleep(60)
            last_edit = self.watcher.get_last_edit_time()

    async def execute_cycle(self) -> bool:
        """Executes a single autonomous repair cycle."""
        self.cycle_count += 1
        self.pid_file.parent.mkdir(parents=True, exist_ok=True)
        self.pid_file.write_text(str(os.getpid()))
        
        try:
            # Check for Fatigue (Master's limit: 6 hours)
            runtime = time.time() - self.start_time
            if runtime > 21600: # 6 hours
                SovereignHUD.persona_log("INFO", "6-Hour Endurance Limit Reached. Returning to Asgard.")
                return False

            self._wait_for_silence()
            
            # 1. THE ONE MIND: Consult Mimir's Well for the mission
            SovereignHUD.persona_log("INFO", "Muninn consulting the One Mind for target allocation...")
            SovereignHUD.persona_log("ALFRED", "'Too much mind, Master. We must trust the Well.'")
            
            # Use MCP to get the ledger targets directly
            # We select the mission via the coordinator which already reads the ledger
            target = self.coordinator.select_mission([])
            
            if not target:
                SovereignHUD.persona_log("SUCCESS", "The Matrix is stabilized. No missions found.")
                return False

            if self.watcher.is_locked(target["file"]):
                SovereignHUD.persona_log("WARN", f"Skipping locked sector: {target['file']}")
                return False

            # 2. FORGE (Shadow)
            file_path = self.root / target["file"]
            if not file_path.exists():
                return False
                
            code = file_path.read_text(encoding="utf-8")
            
            # 3. CRUCIBLE (Gauntlet & Steel)
            test_path = await self.crucible.generate_gauntlet(target, code)
            if not test_path:
                return False
                
            fix_content = await self.crucible.generate_steel(target, code, test_path)
            if not fix_content:
                return False
                
            # Apply and Verify
            self.crucible.apply_fix(file_path, fix_content)
            
            status = "FAILED"
            if self.crucible.verify_fix(test_path):
                self.watcher.record_edit(target["file"], fix_content)
                status = "SUCCESS"
                SovereignHUD.persona_log("SUCCESS", f"Mission Accomplished: {target['file']} sanitized.")
            else:
                self.total_errors += 1
                self.crucible.rollback(file_path)
                self.watcher.record_failure(target["file"])
                SovereignHUD.persona_log("FAIL", f"Mission Failed: {target['file']} rolled back.")
            
            self.memory.record_trace("auto", target["file"], "fix", 0.0, status)
            return status == "SUCCESS"

        except Exception as e:
            self.total_errors += 1
            SovereignHUD.persona_log("ERROR", f"Heart failure: {e}")
            return False
        finally:
            if self.pid_file.exists():
                self.pid_file.unlink()
