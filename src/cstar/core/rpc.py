
import os
import sys
import psutil
import time
from pathlib import Path
from typing import Dict, Any, List

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.sentinel.wardens.norn import NornWarden
from src.core.sovereign_hud import SovereignHUD

class SovereignRPC:
    """
    Handles Remote Procedure Calls from the Sovereign SovereignHUD (TUI).
    Acts as the interface between the Dumb Client and the Daemon Backend.
    """
    def __init__(self, root: Path):
        """
        Initializes the SovereignRPC.
        
        Args:
            root (Path): The project root directory.
        """
        self.root = root
        self.norn = NornWarden(root)

    def get_dashboard_state(self) -> Dict[str, Any]:
        """
        Aggregates system state for the SovereignHUD.
        """
        # 1. System Vitals
        process = psutil.Process(os.getpid())
        mem_mb = process.memory_info().rss / 1024 / 1024
        
        # 2. Git Status (Mock/Simple for now, or subprocess)
        # We can implement a quick check or just return "ACTIVE"
        git_branch = "unknown"
        try:
            head_path = self.root / ".git" / "HEAD"
            if head_path.exists():
                ref = head_path.read_text().strip()
                if "ref: " in ref:
                    git_branch = ref.split("/")[-1]
                else:
                    git_branch = ref[:7]
        except:
            pass

        # 3. Mission Log (Tasks)
        # NornWarden now parses tasks.qmd checklists
        # We want the top 5 unchecked items
        tasks = []
        try:
            # Norn.scan() currently returns *one* next task or a list.
            # We might want to extend Norn or just re-parse manually here for the 'top 5' requirement
            # OR we trust Norn to give us the "Next Objective"
            # Let's peek at Norn again. It scans for the *first* check.
            # To get top 5, we might need to iterate.
            # For this MVP, let's just get the *next* one + some placeholders if needed,
            # or implemented a robust 'scan_all' in Norn later.
            # Let's just use Norn's current scan to get the ACTIVE OBJECTIVE.
            
            # Actually, the user asked for "top 5 unchecked".
            # Norn.get_next_target() gets the *first*.
            # We can implement a specialized scan here or just loop.
            
            all_lines = (self.root / "tasks.qmd").read_text(encoding='utf-8').splitlines()
            count = 0
            for line in all_lines:
                 if "- [ ]" in line:
                     desc = line.split("- [ ]")[1].strip()
                     tasks.append(desc)
                     count += 1
                     if count >= 5: break
        except Exception as e:
            tasks = [f"Error reading tasks: {e}"]

        return {
            "vitals": {
                "cpu": psutil.cpu_percent(),
                "ram": round(mem_mb, 1),
                "branch": git_branch,
                "status": "ONLINE"
            },
            "tasks": tasks,
            "persona": SovereignHUD.PERSONA
        }


    def handle_command(self, cmd: str) -> Dict[str, Any]:
        """
        Executes a command from the TUI input bar.
        """
        # Dispatch logic pending.
        # For Phase 11, we just ack.
        return {"status": "received", "cmd": cmd}
