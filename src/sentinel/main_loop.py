"""
Huginn & Muninn: The Twin Ravens (Daemon)
Identity: ODIN
Purpose: Orchestrate the Ravens agents across the Corvus Cluster.
"""

import json
import logging
import os
import signal
import time
from pathlib import Path
from typing import Any

import psutil
from colorama import init

# Initialize Colorama
init(autoreset=True)

# Shared Bootstrap (env-loading + sys.path) — deferred to avoid import-time side effects
from src.sentinel._bootstrap import PROJECT_ROOT, SovereignBootstrap
from src.core.sovereign_hud import SovereignHUD
from src.sentinel.repo_spoke import RepoSpoke
from src.core.utils import SovereignUtils

# --- GRACEFUL SHUTDOWN ---
class ShutdownHandler:
    """Handles OS signals for graceful termination."""
    def __init__(self) -> None:
        self.active = True
        signal.signal(signal.SIGINT, self.shutdown)
        signal.signal(signal.SIGTERM, self.shutdown)

    def shutdown(self, _signum, _frame) -> None:
        SovereignHUD.persona_log("WARN", "Signal received. Closing all realms...")
        self.active = False

SHUTDOWN = ShutdownHandler()

class DaemonOrchestrator:
    """[O.D.I.N.] The Master Orchestrator of the Ravens Daemon."""
    
    _bootstrapped = False

    @staticmethod
    def ensure_bootstrapped() -> None:
        """Lazily run SovereignBootstrap on first use, not at import time."""
        if not DaemonOrchestrator._bootstrapped:
            SovereignBootstrap.execute()
            DaemonOrchestrator._bootstrapped = True

    @staticmethod
    def load_config() -> dict[str, Any]:
        """Load configuration from .agent/config.json."""
        config_path = PROJECT_ROOT / ".agent" / "config.json"
        return SovereignUtils.safe_read_json(config_path)

    @staticmethod
    def load_target_repos() -> list[str]:
        """Load target repos from config."""
        cfg = DaemonOrchestrator.load_config()
        repos = cfg.get("target_repos")
        if isinstance(repos, list) and repos:
            return [str(p) for p in repos]
        return [str(PROJECT_ROOT)]

    @staticmethod
    def get_interval() -> int:
        """Get cycle interval from config."""
        cfg = DaemonOrchestrator.load_config()
        return cfg.get("interval_seconds", 900)

    @staticmethod
    def load_persona() -> str:
        """Determines the active persona from config."""
        cfg = DaemonOrchestrator.load_config()
        p = cfg.get("persona") or cfg.get("Persona")
        return p.upper() if p else "ODIN"

    @staticmethod
    def _highlander_check(lock_file: Path) -> bool:
        """THERE CAN BE ONLY ONE. Check if we still hold the mandate."""
        if not lock_file.exists():
            return False
        try:
            owner_pid = int(lock_file.read_text().strip())
            if owner_pid != os.getpid():
                if psutil.pid_exists(owner_pid):
                    SovereignHUD.persona_log("WARNING", f"Highlander Protocol: PID {owner_pid} holds the Mandate. Terminating.")
                    return False
        except (OSError, ValueError):
            pass
        return True

    @staticmethod
    async def daemon_loop(use_docker: bool = False, lock_file_path: Path | None = None) -> None:
        """Main daemon loop orchestrating Ravens across the Corvus Cluster with 6-hour endurance."""
        _ensure_bootstrapped = DaemonOrchestrator.ensure_bootstrapped
        LOCK_FILE = lock_file_path or (PROJECT_ROOT / ".agent" / "muninn.pid")
        
        # 6-Hour Guard
        DAEMON_START = time.time()
        MAX_DURATION = 21600 # 6 hours

        if LOCK_FILE.exists():
            try:
                old_pid = int(LOCK_FILE.read_text().strip())
                if psutil.pid_exists(old_pid):
                    print(f"[ERROR] The Ravens are already in flight (PID: {old_pid}). Exiting.")
                    return
            except (ValueError, psutil.Error):
                pass

        LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
        LOCK_FILE.write_text(str(os.getpid()), encoding='utf-8')

        # Initialize
        SovereignHUD.PERSONA = DaemonOrchestrator.load_persona()
        SovereignHUD.persona_log("INFO", "Ravens Endurance Automaton Initialized.")
        SovereignHUD.persona_log("INFO", f"Identity: {SovereignHUD.PERSONA}")
        SovereignHUD.persona_log("INFO", f"Endurance Limit: 6 Hours (Target: {time.ctime(DAEMON_START + MAX_DURATION)})")

        interval = DaemonOrchestrator.get_interval()
        TARGET_REPOS = DaemonOrchestrator.load_target_repos()

        try:
            while SHUTDOWN.active:
                # Check Endurance
                if time.time() - DAEMON_START > MAX_DURATION:
                    SovereignHUD.persona_log("SUCCESS", "Endurance Mission Complete. 6 hours achieved. Returning to Asgard.")
                    break

                if not DaemonOrchestrator._highlander_check(LOCK_FILE):
                    break

                # Hot-Swap Persona
                prev_persona = SovereignHUD.PERSONA
                SovereignHUD.PERSONA = DaemonOrchestrator.load_persona()
                if prev_persona != SovereignHUD.PERSONA:
                    SovereignHUD.persona_log("INFO", f"Persona Shift Detected: {prev_persona} -> {SovereignHUD.PERSONA}")

                cycle_start = time.time()
                SovereignHUD.persona_log("INFO", f"--- FLIGHT CYCLE START: {time.strftime('%H:%M:%S')} ---")

                for repo_str in TARGET_REPOS:
                    if not SHUTDOWN.active: break
                    spoke = RepoSpoke(Path(repo_str), SovereignHUD.PERSONA, use_docker=use_docker)
                    await spoke.process(_ensure_bootstrapped)

                # Sleep with frequent checks
                sleep_time = max(0, interval - (time.time() - cycle_start))
                SovereignHUD.persona_log("INFO", f"--- CYCLE END. Recovery: {int(sleep_time)}s ---")

                slept = 0
                while slept < sleep_time and SHUTDOWN.active:
                    if time.time() - DAEMON_START > MAX_DURATION: break
                    if not DaemonOrchestrator._highlander_check(LOCK_FILE):
                        SHUTDOWN.active = False
                        break
                    time.sleep(min(5, sleep_time - slept))
                    slept += 5
        finally:
            if LOCK_FILE.exists():
                try:
                    if LOCK_FILE.read_text().strip() == str(os.getpid()):
                        LOCK_FILE.unlink()
                        SovereignHUD.persona_log("SUCCESS", "Mandate returned to the All-Father. (Lock Cleared)")
                except (OSError, ValueError):
                    pass

# Logging
logging.basicConfig(
    filename="sovereign_activity.log",
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

if __name__ == "__main__":
    import argparse
    import asyncio
    parser = argparse.ArgumentParser()
    parser.add_argument("--shadow-forge", "--docker", action="store_true", help="Execute the full Ravens cycle in a sandboxed Docker container.")
    args = parser.parse_args()

    _LOCK_PATH = PROJECT_ROOT / ".agent" / "muninn.pid"
    asyncio.run(DaemonOrchestrator.daemon_loop(use_docker=args.shadow_forge, lock_file_path=_LOCK_PATH))
