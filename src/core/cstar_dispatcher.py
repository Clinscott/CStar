#!/usr/bin/env python3
"""
[ODIN] Corvus Star CLI Dispatcher (c*)
Manages command orchestration and workflow triggers with HUD-aligned aesthetics.
Refined for the Linscott Standard (Pathlib).
"""

import subprocess
import sys
import os
from pathlib import Path
from typing import Dict, List

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

    def _discover_commands(self) -> Dict[str, str]:
        """Scans all dynamic locations for available commands."""
        commands = {}

        # Scripts (.py)
        script_dirs = [
            self.project_root / ".agent" / "skills",
            self.project_root / "src" / "tools",
            self.project_root / "src" / "skills" / "local",
        ]
        for d in script_dirs:
            if d.exists():
                for f in d.glob("*.py"):
                    if f.stem not in ["__init__", "_bootstrap"]:
                        commands.setdefault(f.stem, "script")

        # Workflows (.md / .qmd)
        workflow_dir = self.project_root / ".agent" / "workflows"
        if workflow_dir.exists():
            for f in workflow_dir.iterdir():
                if f.suffix in [".md", ".qmd"]:
                    commands.setdefault(f.stem.lower(), "workflow")

        return commands

    def show_help(self) -> None:
        """Displays the C* command interface with dynamically discovered commands."""
        HUD.box_top("🔱 CORVUS STAR CLI (c*)")
        HUD.box_row("Usage", "c* <command> [args...]", dim_label=True)
        HUD.box_separator()

        commands = self._discover_commands()
        scripts = sorted(c for c, t in commands.items() if t == "script")
        workflows = sorted(c for c, t in commands.items() if t == "workflow")

        if scripts:
            HUD.box_row("Scripts", ", ".join(scripts), HUD.GREEN, dim_label=True)
        if workflows:
            HUD.box_separator()
            HUD.box_row("Workflows", ", ".join(workflows), HUD.MAGENTA, dim_label=True)

        HUD.box_separator()
        HUD.box_row("Shortcuts", "-odin, -alfred", HUD.YELLOW)
        HUD.box_bottom()

    def run(self, args: List[str]) -> None:
        """
        Parses and dispatches the command dynamically.
        
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
            # Use dynamic resolution for persona script via direct call
            subprocess.run([str(self.venv_python), str(self.project_root / "scripts" / "set_persona.py"), "ODIN"])
            return
        if cmd == "-alfred":
            subprocess.run([str(self.venv_python), str(self.project_root / "scripts" / "set_persona.py"), "ALFRED"])
            return

        # 1. Dynamic Script Discovery
        dynamic_script = self._resolve_dynamic_script(cmd)
        if dynamic_script:
             # HUD.log("INFO", f"Dynamic Dispatch: {cmd}", f"({dynamic_script.name})")
             env = os.environ.copy()
             env["PYTHONPATH"] = str(self.project_root)
             subprocess.run([str(self.venv_python), str(dynamic_script)] + cmd_args, env=env)
             return

        # 2. Dynamic Workflow Discovery
        dynamic_workflow = self._resolve_workflow(cmd)
        if dynamic_workflow:
             HUD.log("INFO", f"Dispatching workflow: /{cmd}", f"({dynamic_workflow.name})")
             HUD.box_top(f"WORKFLOW: {cmd.upper()}")
             HUD.box_row("Trigger", f"/{cmd}", HUD.CYAN)
             HUD.box_row("File", dynamic_workflow.name, HUD.DIM)
             HUD.box_separator()
             HUD.box_row("Note", "External agents handle /slash commands.", HUD.YELLOW)
             HUD.box_bottom()
             return

        HUD.log("FAIL", f"Unknown command: {cmd}")
        self.show_help()

    def _resolve_dynamic_script(self, cmd: str) -> Path:
        """Searches specific directories for a matching python script."""
        search_paths = [
            self.project_root / ".agent" / "skills",
            self.project_root / "src" / "tools",
            self.project_root / "src" / "skills" / "local"
        ]
        
        for path in search_paths:
            if not path.exists():
                continue
            
            # Check for <cmd>.py
            script_candidate = path / f"{cmd}.py"
            if script_candidate.exists():
                return script_candidate
        return None

    def _resolve_workflow(self, cmd: str) -> Path:
        """Searches for a matching workflow file (.md or .qmd)."""
        workflow_dir = self.project_root / ".agent" / "workflows"
        if not workflow_dir.exists():
            return None

        # Case-insensitive search
        for f in workflow_dir.iterdir():
            if f.is_file() and f.suffix in [".md", ".qmd"]:
                if f.stem.lower() == cmd:
                    return f
        return None


def main() -> None:
    """Entry point for the dispatcher."""
    dispatcher = CorvusDispatcher()
    dispatcher.run(sys.argv[1:])


if __name__ == "__main__":
    main()
