import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

# Add project root to sys.path
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Bootstrap
from src.sentinel._bootstrap import PROJECT_ROOT, bootstrap

bootstrap()

from src.core.sovereign_hud import SovereignHUD

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
        SovereignHUD.PERSONA = (self.config.get("persona") or "ALFRED").upper()

        # [THE CANARY] Initialize AnomalyWarden
        try:
            from src.core.engine.atomic_gpt import AnomalyWarden
            self.warden = AnomalyWarden()
        except Exception:
            self.warden = None

    def _discover_all(self) -> Dict[str, str]:
        """Scans all dynamic locations for available commands."""
        commands = {}

        # Scripts (.py)
        script_dirs = [
            self.project_root / ".agent" / "skills",
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
                
                # Directory-based skill discovery (e.g., skills_db/name/name.py)
                for sub in d.iterdir():
                    if sub.is_dir():
                        main_script = sub / f"{sub.name}.py"
                        if main_script.exists():
                            commands.setdefault(sub.name, str(main_script.resolve()))

        # Workflows (.md / .qmd)
        workflow_dir = self.project_root / ".agent" / "workflows"
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
            SovereignHUD.box_row("SCRIPTS", ", ".join(scripts), SovereignHUD.GREEN, dim_label=True)
        if workflows:
            SovereignHUD.box_separator()
            SovereignHUD.box_row("WORKFLOWS", ", ".join(workflows), SovereignHUD.MAGENTA, dim_label=True)

        SovereignHUD.box_separator()
        SovereignHUD.box_row("SHORTCUTS", "-odin, -alfred", SovereignHUD.YELLOW)
        SovereignHUD.box_bottom()

    def run(self, args: List[str]) -> None:
        """Parses and dispatches the command dynamically."""
        if not args:
            # [Phase 11] Launch Sovereign SovereignHUD (TUI)
            try:
                from src.cstar.core.tui import SovereignApp
                SovereignApp().run()
                return
            except ImportError as e:
                # Fallback if Textual not installed
                SovereignHUD.persona_log("FAIL", f"Sovereign SovereignHUD failed to load (Missing Dependency): {e}")
                self.show_help()
                return
            except Exception as e:
                SovereignHUD.persona_log("FAIL", f"Sovereign SovereignHUD failed to launch: {e}")
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
                # Permanent Execution Jailing: Detect if command is in skills_db
                if "skills_db" in cmd_path:
                    from src.sentinel.sandbox_warden import SandboxWarden
                    warden = SandboxWarden()
                    report = warden.run_in_sandbox(Path(cmd_path), args=cmd_args)
                    
                    if report["stdout"]: print(report["stdout"])
                    if report["stderr"]: print(report["stderr"], file=sys.stderr)
                    if report["timed_out"]:
                        SovereignHUD.persona_log("FAIL", "Sandbox Execution Timed Out.")
                    return
                
                # Native Execution for core framework skills
                env = os.environ.copy()
                env["PYTHONPATH"] = str(self.project_root)
                subprocess.run([str(self.venv_python), cmd_path] + cmd_args, env=env)
                return
            else: # Workflow
                SovereignHUD.persona_log("INFO", f"Dispatching workflow: /{cmd}")
                import shutil
                start_time = time.time()
                error_status = 0.0
                
                if shutil.which("quarto"):
                    try:
                        subprocess.run(["quarto", "render", cmd_path], check=True)
                    except Exception as e:
                         SovereignHUD.persona_log("FAIL", f"Workflow execution failed: {e}")
                         error_status = 1.0
                else:
                    SovereignHUD.persona_log("WARN", "Quarto not found. Displaying raw workflow:")
                    SovereignHUD.box_top(f"WORKFLOW: {cmd}")
                    print(Path(cmd_path).read_text(encoding='utf-8')[:1000] + "\n... (truncated)")
                    SovereignHUD.box_bottom()

                # [CANARY] Record Heartbeat
                latency = (time.time() - start_time) * 1000
                self._record_heartbeat(latency, len(args), 1.0, error_status)
                return

        SovereignHUD.persona_log("FAIL", f"Unknown command: {cmd}")
        self.show_help()

    def _record_heartbeat(self, latency: float, tokens: int, loops: float, error: float):
        """Feeding the Warden."""
        if not self.warden:
            return

        features = [latency, float(tokens), loops, error]
        
        # Inference
        anomaly_prob = self.warden.forward(features)
        
        # Training (Self-Supervised on success)
        # In Burn-In, we assume Healthy (0.0). Post Burn-In, we only train on successes.
        if self.warden.burn_in_cycles > 0:
            self.warden.train_step(features, 0.0)
        elif error == 0.0:
            self.warden.train_step(features, 0.0)

        # Alerting
        if self.warden.burn_in_cycles == 0 and anomaly_prob > 0.8:
            SovereignHUD.persona_log("CRITICAL", f"Anomaly Detected: {anomaly_prob:.2f} (Heartbeat: {features})")

def main() -> None:
    """Entry point for the dispatcher."""
    CorvusDispatcher().run(sys.argv[1:])

if __name__ == "__main__":
    main()