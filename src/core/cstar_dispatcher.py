#!/usr/bin/env python3
"""
[ODIN] Corvus Star CLI Dispatcher (c*)
Manages command orchestration and workflow triggers with HUD-aligned aesthetics.
Refined for the Linscott Standard (Pathlib).
"""

import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple

# [ODIN] Bootstrap: Add project root to sys.path to allow absolute imports
PROJECT_ROOT = Path(__file__).parent.parent.parent.absolute()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Now we can import from src
from src.core.ui import HUD


class CorvusDispatcher:
    """
    Main CLI Dispatcher for the Corvus Star framework.
    Encapsulates command registration and execution logic.
    """

    def __init__(self):
        self.script_path = Path(__file__).parent.absolute()
        self.project_root = self.script_path.parent.parent
        self.scripts_dir = self.script_path
        self.venv_python = self.project_root / ".venv" / "Scripts" / "python.exe"
        
        if not self.venv_python.exists():
            self.venv_python = Path("python")

        # [ODIN] Load Persona from Config
        sys.path.append(str(self.scripts_dir))
        import utils
        self.config = utils.load_config(str(self.project_root))
        HUD.PERSONA = (self.config.get("persona") or self.config.get("Persona") or "ALFRED").upper()

        # Command Registry: {cmd_name: (path/name, type)}
        self.registry: Dict[str, Tuple[str, str]] = {
            "persona": (str(self.scripts_dir / "set_persona.py"), "script"),
            "lets-go": ("lets-go.md", "workflow"),
            "run-task": ("run-task.md", "workflow"),
            "investigate": ("investigate.md", "workflow"),
            "wrap-it-up": ("wrap-it-up.md", "workflow"),
            "fish": ("SovereignFish.qmd", "workflow"),
            "test": ("test.md", "workflow"),
            "oracle": ("oracle.md", "workflow"),
            # Huginn & Muninn: The Twin Ravens (Daemon)
            "daemon": (str(self.project_root / "src" / "sentinel" / "main_loop.py"), "script"),
            "ravens": (str(self.project_root / "src" / "sentinel" / "main_loop.py"), "script"),
            "huginn": (str(self.project_root / "src" / "sentinel" / "main_loop.py"), "script"),
            # Tools - Heimdall (The All-Seeing Guardian)
            "heimdall": (str(self.project_root / "src" / "tools" / "code_sentinel.py"), "script"),
            "audit": (str(self.project_root / "src" / "tools" / "code_sentinel.py"), "script"),
            "trace": (str(self.project_root / "src" / "tools" / "trace_viz.py"), "script"),
            "synapse": (str(self.project_root / "src" / "synapse" / "synapse_sync.py"), "script"),
            "network": (str(self.project_root / "src" / "tools" / "network_watcher.py"), "script"),
        }

    def show_help(self) -> None:
        """Displays the C* command interface."""
        HUD.box_top("🔱 CORVUS STAR CLI (c*)")
        HUD.box_row("Usage", "c* <command> [args...]", dim_label=True)
        HUD.box_separator()
        
        HUD.box_row("Commands", "Description", HUD.CYAN)
        for cmd in sorted(self.registry.keys()):
            HUD.box_row(cmd, f"Trigger /{cmd}", dim_label=True)
        
        HUD.box_separator()
        HUD.box_row("Shortcuts", "-odin, -alfred", HUD.YELLOW)
        HUD.box_bottom()

    def check_ravens_status(self) -> None:
        """Checks if the Ravens (Huginn & Muninn daemon) are in flight."""
        HUD.log("INFO", "Checking if the Ravens are in flight...")
        try:
            # [ODIN] Filter specifically for python processes to avoid matching the PS check itself
            # We also exclude the current process tree just in case
            ps_cmd = (
                "$currentPid = $pid; "
                "Get-CimInstance Win32_Process -Filter \"Name LIKE 'python%' AND (CommandLine LIKE '%main_loop.py%' OR CommandLine LIKE '%src.sentinel.main_loop%')\" | "
                "Where-Object { $_.ProcessId -ne $currentPid -and $_.ParentProcessId -ne $currentPid } | "
                "Select-Object -ExpandProperty ProcessId"
            )
            result = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
            
            pids = [p.strip() for p in result.stdout.strip().splitlines() if p.strip()]
            if pids:
                HUD.log("SUCCESS", "The Ravens are in flight", f"(PIDs: {', '.join(pids)})")
            else:
                HUD.log("WARN", "The Ravens are grounded")
        except Exception as e:
            HUD.log("FAIL", f"Status Check Failed: {e}")

    def recall_ravens(self) -> None:
        """Recalls the Ravens (terminates the daemon) with extreme prejudice."""
        HUD.log("INFO", "Initiating START-9 (Nuclear Termination)...")
        try:
            # [ODIN] Aggressive multi-stage kill
            # 1. Kill the main instances and their direct children
            ps_kill = (
                "$currentPid = $pid; "
                "$targets = Get-CimInstance Win32_Process -Filter \"Name LIKE 'python%' AND (CommandLine LIKE '%main_loop.py%' OR CommandLine LIKE '%src.sentinel.main_loop%')\"; "
                "if ($targets) { "
                "  $targets | Where-Object { $_.ProcessId -ne $currentPid } | ForEach-Object { "
                "    $p = $_; "
                "    Get-CimInstance Win32_Process -Filter \"ParentProcessId = $($p.ProcessId)\" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; "
                "    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue "
                "  }"
                "}"
            )
            subprocess.run(["powershell", "-NoProfile", "-Command", ps_kill], capture_output=True)
            
            # 2. Cleanup Lock File
            lock_file = self.project_root / "src" / "sentinel" / "ravens.lock"
            if lock_file.exists():
                lock_file.unlink()
            
            HUD.log("SUCCESS", "Ravens recalled and roost cleared.")
                
        except Exception as e:
            HUD.log("FAIL", f"Termination Protocol Failed: {e}")

    def release_ravens(self) -> None:
        """Releases the Ravens (Huginn & Muninn) to fly across the Nine Realms."""
        HUD.log("INFO", "Releasing the Ravens...")
        try:
            project_dir = str(self.project_root)
            cmd_str = f"Set-Location '{project_dir}'; & '{self.venv_python}' -m src.sentinel.main_loop"
            
            # Use PowerShell Start-Process to spawn a new window with the environment
            ps_cmd = f"Start-Process powershell -ArgumentList '-NoExit', '-Command', \"{cmd_str}\""
            
            subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=True)
            HUD.log("SUCCESS", "The Ravens take flight.")
        except Exception as e:
            HUD.log("FAIL", f"Deployment Failed: {e}")

    def run(self, args: List[str]) -> None:
        """
        Parses and dispatches the command.
        
        Args:
            args: Command line arguments (excluding script name).
        """
        if not args:
            self.show_help()
            return

        cmd = args[0].lower()
        cmd_args = args[1:]

        # Persona Shortcuts
        if cmd == "-odin":
            subprocess.run([str(self.venv_python), str(self.scripts_dir / "set_persona.py"), "ODIN"])
            return
        if cmd == "-alfred":
            subprocess.run([str(self.venv_python), str(self.scripts_dir / "set_persona.py"), "ALFRED"])
            return

        # Ravens Management (Huginn & Muninn Daemon)
        if cmd in ["ravens", "huginn", "daemon"]:
            if "-status" in cmd_args:
                self.check_ravens_status()
                return
            if "-end" in cmd_args or "-kill" in cmd_args or "-recall" in cmd_args:
                self.recall_ravens()
                return
            # Default: Release the Ravens
            self.release_ravens()
            return

        if cmd in self.registry:
            target, target_type = self.registry[cmd]
            if target_type == "script":
                subprocess.run([str(self.venv_python), target] + cmd_args)
            elif target_type == "workflow":
                HUD.log("INFO", f"Dispatching workflow: /{cmd}", f"({target})")
                HUD.box_top(f"WORKFLOW: {cmd.upper()}")
                HUD.box_row("Trigger", f"/{cmd}", HUD.CYAN)
                HUD.box_row("File", target, HUD.DIM)
                HUD.box_separator()
                HUD.box_row("Note", "External agents handle /slash commands.", HUD.YELLOW)
                HUD.box_bottom()
        else:
            HUD.log("FAIL", f"Unknown command: {cmd}")
            self.show_help()


def main() -> None:
    """Entry point for the dispatcher."""
    dispatcher = CorvusDispatcher()
    dispatcher.run(sys.argv[1:])


if __name__ == "__main__":
    main()
