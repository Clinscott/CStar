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

from ui import HUD


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
            # Sovereign Fish Automaton
            "daemon": (str(self.project_root / "main_loop.py"), "script"),
            "sentinel": (str(self.project_root / "main_loop.py"), "script"),
            "sentinal": (str(self.project_root / "main_loop.py"), "script"),
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

    def check_sentinel_status(self) -> None:
        """Checks if the Sentinel (main_loop.py) is running."""
        HUD.log("INFO", "Checking Sentinel Status...")
        try:
            # Use PowerShell to check for main_loop.py
            ps_cmd = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*main_loop.py*' } | Select-Object -ExpandProperty ProcessId"
            result = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
            
            pids = result.stdout.strip().splitlines()
            if pids:
                HUD.log("SUCCESS", "Sentinel is RUNNING", f"(PIDs: {', '.join(pids)})")
            else:
                HUD.log("WARN", "Sentinel is NOT RUNNING")
        except Exception as e:
            HUD.log("FAIL", f"Status Check Failed: {e}")

    def kill_sentinel(self) -> None:
        """Terminates the Sentinel (main_loop.py) process."""
        HUD.log("INFO", "Attempting to terminate Sentinel...")
        try:
            # Find and kill the process
            ps_cmd = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*main_loop.py*' } | Stop-Process -Force -PassThru"
            result = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
            
            if result.stdout.strip():
                HUD.log("SUCCESS", "Sentinel Terminated.")
            else:
                HUD.log("WARN", "No running Sentinel found to terminate.")
        except Exception as e:
            HUD.log("FAIL", f"Termination Failed: {e}")

    def launch_sentinel(self) -> None:
        """Launches the Sentinel (main_loop.py) in a new detached terminal window."""
        HUD.log("INFO", "Deploying Sentinel to New Window...")
        try:
            target = str(self.project_root / "main_loop.py")
            cmd_str = f"& '{self.venv_python}' '{target}'"
            
            # Use PowerShell Start-Process to spawn a new window with the environment
            ps_cmd = f"Start-Process powershell -ArgumentList '-NoExit', '-Command', \"{cmd_str}\""
            
            subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=True)
            HUD.log("SUCCESS", "Sentinel Deployed.")
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

        # Sentinel Management
        if cmd in ["sentinel", "sentinal"]:
            if "-status" in cmd_args:
                self.check_sentinel_status()
                return
            if "-end" in cmd_args or "-kill" in cmd_args:
                self.kill_sentinel()
                return
            # Default: Launch new instance
            self.launch_sentinel()
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
