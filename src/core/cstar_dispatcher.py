import os
import subprocess
import sys
import time
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.core.sovereign_hud import SovereignHUD
from src.sentinel._bootstrap import PROJECT_ROOT, SovereignBootstrap

SovereignBootstrap.execute()

class CorvusDispatcher:
    """
    Main CLI Dispatcher for the Corvus Star framework.
    Now fully integrated with the Agentic Stack Skills.
    """
    def __init__(self, root: Path | None = None) -> None:
        self.project_root = root or PROJECT_ROOT
        self.venv_python = self.project_root / ".venv" / "Scripts" / "python.exe"
        if not self.venv_python.exists():
            self.venv_python = Path(sys.executable)

        # Persona Synchronization delegated to 'personas' skill
        # [ALFRED]: We still load persona for the HUD display, but policy is skill-based.
        from src.core.utils import load_config
        self.config = load_config(str(self.project_root))
        SovereignHUD.PERSONA = (self.config.get("persona") or self.config.get("system", {}).get("persona", "ALFRED")).upper()

    def _discover_all(self) -> dict[str, str]:
        """Scans all dynamic locations for available commands."""
        commands = {}

        # Scripts (.py)
        script_dirs = [
            self.project_root / ".agents" / "skills",
            self.project_root / "src" / "tools",
            self.project_root / "src" / "skills" / "local",
            self.project_root / "skills_db",
            self.project_root / "src" / "sentinel",
            self.project_root / "scripts",
        ]
        for d in script_dirs:
            if d.exists():
                # Direct file discovery
                for f in d.glob("*.py"):
                    if f.stem not in ["__init__", "_bootstrap", "cstar_dispatcher"]:
                        commands.setdefault(f.stem, str(f.resolve()))

                # Directory-based skill discovery (e.g., .agents/skills/name/scripts/name.py)
                for sub in d.iterdir():
                    if sub.is_dir():
                        scripts_dir = sub / "scripts"
                        main_script = scripts_dir / f"{sub.name}.py"
                        if main_script.exists():
                            commands.setdefault(sub.name, str(main_script.resolve()))
                        else:
                            # Legacy check
                            main_script = sub / f"{sub.name}.py"
                            if main_script.exists():
                                commands.setdefault(sub.name, str(main_script.resolve()))

        # Workflows (.md / .qmd)
        workflow_dir = self.project_root / ".agents" / "workflows"
        if workflow_dir.exists():
            for f in workflow_dir.iterdir():
                if f.suffix in [".md", ".qmd"]:
                    commands.setdefault(f.stem.lower(), str(f.resolve()))

        return commands

    def show_help(self) -> None:
        """Displays the C* command interface."""
        SovereignHUD.box_top("🔱 CORVUS STAR CLI (c*)")
        SovereignHUD.box_row("ROOT", str(self.project_root), dim_label=True)
        SovereignHUD.box_separator()

        commands = self._discover_all()
        scripts = sorted(c for c, p in commands.items() if p.endswith(".py"))
        workflows = sorted(c for c, p in commands.items() if p.endswith(".md") or p.endswith(".qmd"))

        if scripts:
            SovereignHUD.box_row("SKILLS", ", ".join(scripts), SovereignHUD.GREEN, dim_label=True)
        if workflows:
            SovereignHUD.box_separator()
            SovereignHUD.box_row("WORKFLOWS", ", ".join(workflows), SovereignHUD.MAGENTA, dim_label=True)

        SovereignHUD.box_separator()
        SovereignHUD.box_row("SHORTCUTS", "-odin, -alfred", SovereignHUD.YELLOW)
        SovereignHUD.box_bottom()

    def run(self, args: list[str]) -> None:
        """Parses and dispatches the command dynamically."""
        if not args:
            # [Phase 11] Launch Sovereign SovereignHUD (TUI)
            try:
                from src.cstar.core.tui import SovereignApp
                SovereignApp().run()
                return
            except Exception as e:
                SovereignHUD.persona_log("FAIL", f"Sovereign SovereignHUD failed to launch: {e}")
                self.show_help()
                return

        cmd = args[0].lower()
        cmd_args = args[1:]

        # Persona Shortcuts (Routed to personas skill)
        if cmd in ["-odin", "-alfred"]:
            persona = "ODIN" if cmd == "-odin" else "ALFRED"
            self._execute_skill("personas", ["--set", persona])
            return

        # Dynamic Resolution
        all_cmds = self._discover_all()
        if cmd in all_cmds:
            cmd_path = all_cmds[cmd]
            start_time = time.time()
            error_status = 0.0

            try:
                if cmd_path.endswith(".py"):
                    # Native Execution
                    env = os.environ.copy()
                    env["PYTHONPATH"] = str(self.project_root)
                    subprocess.run([str(self.venv_python), cmd_path, *cmd_args], env=env, check=True)
                else: # Workflow
                    SovereignHUD.persona_log("INFO", f"Dispatching workflow: /{cmd}")
                    import shutil
                    quarto_path = shutil.which("quarto") or r"C:\Program Files\Quarto\bin\quarto.exe"
                    if os.path.exists(quarto_path):
                        subprocess.run([quarto_path, "render", cmd_path], check=True)
                    else:
                        SovereignHUD.persona_log("WARN", "Quarto not found. Displaying raw workflow:")
                        SovereignHUD.box_top(f"WORKFLOW: {cmd}")
                        print(Path(cmd_path).read_text(encoding='utf-8')[:1000] + "\n... (truncated)")
                        SovereignHUD.box_bottom()
            except Exception as e:
                SovereignHUD.persona_log("FAIL", f"Command '{cmd}' failed: {e}")
                error_status = 1.0

            # [CANARY] Record Heartbeat via 'warden' and 'telemetry' skills
            latency = (time.time() - start_time) * 1000
            self._record_agentic_heartbeat(cmd, latency, len(args), error_status)
            return

        SovereignHUD.persona_log("FAIL", f"Unknown command: {cmd}")
        self.show_help()

    def _execute_skill(self, skill_name: str, args: list[str]) -> None:
        """Helper to run a skill script from within the dispatcher."""
        all_cmds = self._discover_all()
        if skill_name in all_cmds:
            cmd_path = all_cmds[skill_name]
            env = os.environ.copy()
            env["PYTHONPATH"] = str(self.project_root)
            subprocess.run([str(self.venv_python), cmd_path, *args], env=env)

    def _record_agentic_heartbeat(self, cmd: str, latency: float, tokens: int, error: float) -> None:
        """Delegates heartbeat recording to the Telemetry and Warden skills."""
        mission_id = f"CLI-{cmd.upper()}-{int(time.time())}"
        
        # 1. Dispatch Telemetry Trace
        self._execute_skill("telemetry", [
            "trace", 
            "--mission", mission_id,
            "--file", f"CLI/{cmd}",
            "--metric", "LATENCY",
            "--score", str(latency),
            "--justification", f"CLI execution of {cmd}",
            "--status", "SUCCESS" if error == 0.0 else "FAIL"
        ])

        # 2. Trigger Warden Evaluation
        # Vector: [latency, tokens, loops, error, lore_alignment]
        vector = [latency, float(tokens), 1.0, error, 1.0 if error == 0.0 else 0.5]
        import json
        self._execute_skill("warden", ["eval", "--vector", json.dumps(vector)])

def main() -> None:
    """Entry point for the dispatcher."""
    CorvusDispatcher().run(sys.argv[1:])

if __name__ == "__main__":
    main()
