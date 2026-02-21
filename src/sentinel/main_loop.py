"""
Huginn & Muninn: The Twin Ravens (Daemon)
Identity: ODIN
Purpose: Orchestrate the SovereignFish agents across the Corvus Cluster.

Huginn (Thought) gathers intel. Muninn (Memory) persists it.
Together they fly across the Nine Realms, reporting all to the All-Father.
"""

import json
import logging
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Any

import psutil
from colorama import Fore, init

# Initialize Colorama
init(autoreset=True)

# Shared Bootstrap (env-loading + sys.path) — fixes .env.local path bug
from src.sentinel._bootstrap import PROJECT_ROOT, bootstrap

bootstrap()

from src.core.ui import HUD
from src.sentinel.muninn import Muninn


# --- GRACEFUL SHUTDOWN ---
class ShutdownHandler:
    """Handles OS signals for graceful termination."""
    def __init__(self) -> None:
        self.active = True
        signal.signal(signal.SIGINT, self.shutdown)
        signal.signal(signal.SIGTERM, self.shutdown)

    def shutdown(self, signum, frame):
        HUD.persona_log("WARN", f"Signal {signum} received. Closing all realms...")
        self.active = False

SHUTDOWN = ShutdownHandler()

# Configuration
def load_config() -> dict[str, Any]:
    """Load configuration from .agent/config.json."""
    config_path = PROJECT_ROOT / ".agent" / "config.json"
    if config_path.exists():
        try:
            return json.loads(config_path.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError):
            pass
    return {}

def load_target_repos() -> list[str]:
    """Load target repos from config."""
    cfg = load_config()
    repos = cfg.get("target_repos")
    if isinstance(repos, list) and repos:
        return [str(p) for p in repos]
    return [str(PROJECT_ROOT)]

def get_interval() -> int:
    """Get cycle interval from config."""
    cfg = load_config()
    return cfg.get("interval_seconds", 900)

# Logging handled by sovereign_fish logging config (shared file)
logging.basicConfig(
    filename="sovereign_activity.log",
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

def git_cmd(repo_path: str | Path, args: list[str]) -> str | None:
    """Executes a git command in the target repo."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            check=True
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

def is_clean(repo_path: str | Path) -> bool:
    """Checks if the repo is clean."""
    status = git_cmd(repo_path, ["status", "--porcelain"])
    return status == ""

def ensure_branch(repo_path: str | Path, branch_name: str = "sovereign-fish-auto") -> str | None:
    """Switches to the dedicated automation branch."""
    current = git_cmd(repo_path, ["branch", "--show-current"])
    branches = git_cmd(repo_path, ["branch", "--list", branch_name])

    if not branches:
        git_cmd(repo_path, ["checkout", "-b", branch_name])
    else:
        git_cmd(repo_path, ["checkout", branch_name])

    return current

def restore_branch(repo_path: str | Path, original_branch: str | None) -> None:
    """Restores the original branch."""
    if original_branch:
        git_cmd(repo_path, ["checkout", original_branch])

def load_persona() -> str:
    """Determines the active persona from config."""
    cfg = load_config()
    p = cfg.get("persona") or cfg.get("Persona")
    return p.upper() if p else "ODIN"

def process_repo(repo_path: Path, persona: str) -> bool:
    """Process a single repository cycle."""
    repo_name = repo_path.name
    if not repo_path.exists():
        logging.warning(f"[{repo_name}] [SKIP] Path not found.")
        return False

    HUD.persona_log("INFO", f"Auditing {repo_name}...")

    # 1. Dirty Check
    if not is_clean(repo_path):
        HUD.persona_log("WARN", f"{repo_name}: Dirty tree. Skipping to preserve user state.")
        logging.info(f"[{repo_name}] [SKIP] Dirty working tree.")
        return False

    # 2. Isolation
    original_branch = ensure_branch(repo_path)

    try:
        # 3. Execution
        raven = Muninn(str(repo_path))
        changed = raven.run()

        # 4. Commit (If changed)
        if changed:
            ts = time.strftime("%Y-%m-%d %H:%M")
            commit_msg = (
                f"🧹 Alfred: Tying up loose ends [{ts}]"
                if persona == "ALFRED"
                else f"🐟 Sovereign Fish: Auto-improvement [{ts}]"
            )

            git_cmd(repo_path, ["add", "-A"])
            git_cmd(repo_path, ["commit", "-m", commit_msg])
            HUD.persona_log("SUCCESS", f"Changes Committed: {commit_msg}")
            logging.info(f"[{repo_name}] [COMMIT] {commit_msg}")
            return True
        else:
            return False

    except Exception as e:
        HUD.persona_log("ERROR", f"EXECUTION ERROR: {e}")
        logging.error(f"[{repo_name}] [EXEC_ERROR] {e}")
        return False
    finally:
        # 5. Cleanup
        restore_branch(repo_path, original_branch)

def highlander_check(lock_file: Path) -> bool:
    """THERE CAN BE ONLY ONE. Check if we still hold the mandate."""
    if not lock_file.exists():
        return False
    try:
        owner_pid = int(lock_file.read_text().strip())
        if owner_pid != os.getpid():
            if psutil.pid_exists(owner_pid):
                HUD.persona_log("WARNING", f"Highlander Protocol: PID {owner_pid} holds the Mandate. Terminating.")
                return False
    except (OSError, ValueError):
        pass
    return True

def daemon_loop(lock_file_path: Path | None = None):
    """Main daemon loop orchestrating SovereignFish across the Corvus Cluster."""
    LOCK_FILE = lock_file_path or (Path(__file__).parent / "ravens.lock")

    if LOCK_FILE.exists():
        try:
            old_pid = int(LOCK_FILE.read_text().strip())
            if psutil.pid_exists(old_pid):
                print(f"{Fore.RED}[ERROR] The Ravens are already in flight (PID: {old_pid}). Exiting.")
                return
        except (ValueError, psutil.Error):
            pass

    LOCK_FILE.write_text(str(os.getpid()), encoding='utf-8')

    # Initialize
    HUD.PERSONA = load_persona()
    HUD.persona_log("INFO", "Sovereign Fish Automaton Initialized.")
    HUD.persona_log("INFO", f"Identity: {HUD.PERSONA}")

    interval = get_interval()
    TARGET_REPOS = load_target_repos()

    try:
        while SHUTDOWN.active:
            if not highlander_check(LOCK_FILE):
                break

            # Hot-Swap Persona
            prev_persona = HUD.PERSONA
            HUD.PERSONA = load_persona()
            if prev_persona != HUD.PERSONA:
                HUD.persona_log("INFO", f"Persona Shift Detected: {prev_persona} -> {HUD.PERSONA}")

            cycle_start = time.time()
            HUD.persona_log("INFO", f"--- CYCLE START: {time.strftime('%H:%M:%S')} ---")

            for repo_str in TARGET_REPOS:
                if not SHUTDOWN.active: break
                process_repo(Path(repo_str), HUD.PERSONA)

            # Sleep with frequent checks
            sleep_time = max(0, interval - (time.time() - cycle_start))
            HUD.persona_log("INFO", f"--- CYCLE END. Sleeping for {int(sleep_time)}s ---")

            slept = 0
            while slept < sleep_time and SHUTDOWN.active:
                if not highlander_check(LOCK_FILE):
                    SHUTDOWN.active = False
                    break
                time.sleep(min(5, sleep_time - slept))
                slept += 5
    finally:
        if LOCK_FILE.exists():
            try:
                if LOCK_FILE.read_text().strip() == str(os.getpid()):
                    LOCK_FILE.unlink()
                    HUD.persona_log("SUCCESS", "Mandate returned to the All-Father. (Lock Cleared)")
            except (OSError, ValueError):
                pass

if __name__ == "__main__":
    _LOCK_PATH = Path(__file__).parent / "ravens.lock"
    daemon_loop(_LOCK_PATH)
