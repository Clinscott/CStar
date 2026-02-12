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

    def __init__(self, root: Path | str | None = None, base: Path | str | None = None):
        self.script_path = Path(__file__).parent.absolute()
        self.project_root = Path(root) if root else self.script_path.parent.parent
        self.scripts_dir = Path(base) if base else self.script_path
        self.venv_python = self.project_root / ".venv" / "Scripts" / "python.exe"
        
        if not self.venv_python.exists():
            self.venv_python = Path("python")

        # [ODIN] Load Persona from Config
        sys.path.append(str(self.scripts_dir))
        import utils
        self.config = utils.load_config(str(self.project_root))
        HUD.PERSONA = (self.config.get("persona") or self.config.get("Persona") or "ALFRED").upper()

    def _discover_all(self) -> Dict[str, str]:
        """Scans all dynamic locations for available commands, returning {name: path}."""
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
                        commands.setdefault(f.stem, str(f))

        # Workflows (.md / .qmd)
        workflow_dir = self.project_root / ".agent" / "workflows"
        if workflow_dir.exists():
            for f in workflow_dir.iterdir():
                if f.suffix in [".md", ".qmd"]:
                    commands.setdefault(f.stem.lower(), str(f))

        return commands

    def show_help(self) -> None:
        """Displays the C* command interface with dynamically discovered commands."""
        HUD.box_top("🔱 CORVUS STAR CLI (c*)")
        HUD.box_row("Usage", "c* <command> [args...]", dim_label=True)
        HUD.box_separator()

        commands = self._discover_all()
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
        if cmd in ["-odin", "-alfred"]:
            persona = "ODIN" if cmd == "-odin" else "ALFRED"
            env = os.environ.copy()
            env["PYTHONPATH"] = str(self.project_root)
            subprocess.run([str(self.venv_python), str(self.project_root / "scripts" / "set_persona.py"), persona], env=env)
            return

        # Dynamic Resolution
        all_cmds = self._discover_all()
        if cmd in all_cmds:
            cmd_path = all_cmds[cmd]
            if cmd_path.endswith(".py"):
                env = os.environ.copy()
                env["PYTHONPATH"] = str(self.project_root)
                subprocess.run([str(self.venv_python), cmd_path] + cmd_args, env=env)
                return
            else: # Workflow
                HUD.log("INFO", f"Dispatching workflow: /{cmd}", f"({os.path.basename(cmd_path)})")
                HUD.box_top(f"WORKFLOW: {cmd.upper()}")
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
