import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional

# Bootstrap
from src.sentinel._bootstrap import PROJECT_ROOT, bootstrap

bootstrap()

from src.core.ui import HUD

class CorvusDispatcher:
    """
    Main CLI Dispatcher for the Corvus Star framework.
    """
    def __init__(self, root: Optional[Path] = None) -> None:
        self.project_root = root or PROJECT_ROOT
        self.venv_python = self.project_root / ".venv" / "Scripts" / "python.exe"
        if not self.venv_python.exists():
            self.venv_python = Path(sys.executable)

        # Persona Synchronization
        from src.core.utils import load_config
        self.config = load_config(str(self.project_root))
        HUD.PERSONA = (self.config.get("persona") or "ALFRED").upper()

    def _discover_all(self) -> Dict[str, str]:
        """Scans all dynamic locations for available commands."""
        commands = {}

        # Scripts (.py)
        script_dirs = [
            self.project_root / ".agent" / "skills",
            self.project_root / "src" / "tools",
            self.project_root / "src" / "skills" / "local",
            self.project_root / "src" / "sentinel",
            self.project_root / "scripts",
        ]
        for d in script_dirs:
            if d.exists():
                for f in d.glob("*.py"):
                    if f.stem not in ["__init__", "_bootstrap", "cstar_dispatcher"]:
                        commands.setdefault(f.stem, str(f.resolve()))

        # Workflows (.md / .qmd)
        workflow_dir = self.project_root / ".agent" / "workflows"
        if workflow_dir.exists():
            for f in workflow_dir.iterdir():
                if f.suffix in [".md", ".qmd"]:
                    commands.setdefault(f.stem.lower(), str(f.resolve()))

        return commands

    def show_help(self) -> None:
        """Displays the C* command interface."""
        HUD.box_top("🔱 CORVUS STAR CLI (c*)")
        HUD.box_row("ROOT", str(self.project_root), dim_label=True)
        HUD.box_separator()

        commands = self._discover_all()
        scripts = sorted(c for c, p in commands.items() if p.endswith(".py"))
        workflows = sorted(c for c, p in commands.items() if p.endswith(".md") or p.endswith(".qmd"))

        if scripts:
            HUD.box_row("SCRIPTS", ", ".join(scripts), HUD.GREEN, dim_label=True)
        if workflows:
            HUD.box_separator()
            HUD.box_row("WORKFLOWS", ", ".join(workflows), HUD.MAGENTA, dim_label=True)

        HUD.box_separator()
        HUD.box_row("SHORTCUTS", "-odin, -alfred", HUD.YELLOW)
        HUD.box_bottom()

    def run(self, args: List[str]) -> None:
        """Parses and dispatches the command dynamically."""
        if not args:
            self.show_help()
            return

        cmd = args[0].lower()
        cmd_args = args[1:]

        # Persona Shortcuts
        if cmd in ["-odin", "-alfred"]:
            persona = "ODIN" if cmd == "-odin" else "ALFRED"
            set_persona_script = self.project_root / "src" / "core" / "set_persona.py"
            if not set_persona_script.exists():
                set_persona_script = self.project_root / "scripts" / "set_persona.py"
                
            env = os.environ.copy()
            env["PYTHONPATH"] = str(self.project_root)
            subprocess.run([str(self.venv_python), str(set_persona_script), persona], env=env)
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
                HUD.persona_log("INFO", f"Dispatching workflow: /{cmd}")
                try:
                    # Execute Quarto workflow
                    subprocess.run(["quarto", "render", cmd_path], check=True)
                except Exception as e:
                    HUD.persona_log("FAIL", f"Workflow execution failed: {e}")
                return

        HUD.persona_log("FAIL", f"Unknown command: {cmd}")
        self.show_help()

def main() -> None:
    """Entry point for the dispatcher."""
    CorvusDispatcher().run(sys.argv[1:])

if __name__ == "__main__":
    main()