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
import subprocess
import sys
import time
from pathlib import Path

from colorama import Fore, init

# Initialize Colorama
init(autoreset=True)

# Shared Bootstrap (env-loading + sys.path) — fixes .env.local path bug
from src.sentinel._bootstrap import PROJECT_ROOT, bootstrap

bootstrap()

from src.core.ui import HUD
from src.sentinel.muninn import Muninn

# Configuration
INTERVAL_SECONDS = 900  # 15 Minutes


def load_target_repos() -> list[str]:
    """Load target repos from config, with hardcoded defaults."""
    config_path = PROJECT_ROOT / ".agent" / "config.json"
    if config_path.exists():
        try:
            cfg = json.loads(config_path.read_text(encoding='utf-8'))
            repos = cfg.get("target_repos")
            if isinstance(repos, list) and repos:
                return repos
        except (json.JSONDecodeError, OSError):
            pass
    return [
        r"c:\Users\Craig\Corvus\CorvusStar",
        r"c:\Users\Craig\Corvus\KeepOS",
        r"c:\Users\Craig\Corvus\The Nexus",
    ]

# Logging handled by sovereign_fish logging config (shared file) or we can init here too
logging.basicConfig(
    filename="sovereign_activity.log",
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

def git_cmd(repo_path, args):
    """Executes a git command in the target repo."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=repo_path,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        # print(f"Git Error: {e.stderr}")
        return None

def is_clean(repo_path):
    """Checks if the repo is clean."""
    status = git_cmd(repo_path, ["status", "--porcelain"])
    # If status is None, git failed (maybe not a repo), treat as dirty/unsafe
    if status is None:
        return False
    return len(status) == 0

def ensure_branch(repo_path, branch_name="sovereign-fish-auto"):
    """Switches to the dedicated automation branch."""
    current = git_cmd(repo_path, ["branch", "--show-current"])

    # Check if branch exists
    branches = git_cmd(repo_path, ["branch", "--list", branch_name])

    if not branches:
        # Create it
        git_cmd(repo_path, ["checkout", "-b", branch_name])
    else:
        # Switch to it
        git_cmd(repo_path, ["checkout", branch_name])

    return current # Return original branch to restore later

def restore_branch(repo_path, original_branch):
    """Restores the original branch."""
    if original_branch:
        git_cmd(repo_path, ["checkout", original_branch])


def load_persona():
    """Determines the active persona from .agent/config.json."""
    try:
        project_root = Path(__file__).parent.parent.parent.absolute()
        cfg_path = project_root / ".agent" / "config.json"
        if cfg_path.exists():
            import json
            with open(cfg_path) as f:
                data = json.load(f)
                p = data.get("persona") or data.get("Persona")
                if p: return p.upper()
    except Exception:
        pass
    return "ODIN"  # Default to the All-Father


def process_repo(repo_path: Path, persona: str) -> bool:
    """Process a single repository cycle. Extracted for testability."""
    repo_name = repo_path.name

    if not repo_path.exists():
        logging.warning(f"[{repo_name}] [SKIP] Path not found.")
        return False

    print(f"{Fore.WHITE}Checking {repo_name}...")

    # 1. Dirty Check
    if not is_clean(repo_path):
        print(f"{Fore.YELLOW}  -> Dirty Working Tree. SKIPPING.")
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
            if persona == "ALFRED":
                commit_msg = f"🧹 Alfred: Tying up loose ends [{ts}]"
            else:
                commit_msg = f"🐟 Sovereign Fish: Auto-improvement [{ts}]"

            git_cmd(repo_path, ["add", "-A"])
            git_cmd(repo_path, ["commit", "-m", commit_msg])
            HUD.persona_log("SUCCESS", f"Changes Committed ({commit_msg})")
            logging.info(f"[{repo_name}] [COMMIT] {commit_msg}")
            return True
        else:
            HUD.persona_log("INFO", "No changes needed.")
            return False

    except Exception as e:
        HUD.persona_log("ERROR", f"EXECUTION ERROR: {e}")
        logging.error(f"[{repo_name}] [EXEC_ERROR] {e}")
        return False
    finally:
        # 5. Cleanup
        restore_branch(repo_path, original_branch)


def daemon_loop():
    """Main daemon loop orchestrating SovereignFish across the Corvus Cluster."""
    # 1. Load Persona
    HUD.PERSONA = load_persona()
    theme = HUD.get_theme()
    PREFIX = theme["prefix"]


    # --- SINGLETON CHECK ---
    # Use absolute path to ensure lock is found regardless of CWD
    LOCK_FILE = Path(__file__).parent / "ravens.lock"

    if LOCK_FILE.exists():
        try:
            old_pid = int(LOCK_FILE.read_text().strip())
            # Check if process is actually running
            import psutil
            if psutil.pid_exists(old_pid):
                print(f"{Fore.RED}[ERROR] The Ravens are already in flight (PID: {old_pid}). Exiting.")
                return
        except (ValueError, ImportError):
            # lock file corrupted or psutil missing, ignore verify
            pass

    # Create Lock
    LOCK_FILE.write_text(str(os.getpid()))

    # 2. Initialize
    HUD.persona_log("INFO", "Sovereign Fish Automaton Initialized.")
    HUD.persona_log("INFO", f"Identity: {theme.get('greeting', 'Unknown')}")
    HUD.persona_log("INFO", f"Schedule: Every {INTERVAL_SECONDS}s")

    TARGET_REPOS = load_target_repos()
    HUD.persona_log("INFO", f"Targets: {[Path(p).name for p in TARGET_REPOS]}")

    def highlander_check():
        """THERE CAN BE ONLY ONE. Check if we still hold the mandate."""
        if not LOCK_FILE.exists():
            # Lock gone? We are ghost.
            return False

        try:
            owner_pid = int(LOCK_FILE.read_text().strip())
            if owner_pid != os.getpid():
                # We are not the owner.
                import psutil
                if psutil.pid_exists(owner_pid):
                    HUD.persona_log("WARNING", f"Highlander Protocol: PID {owner_pid} holds the Mandate. Terminating.")
                    return False
        except OSError:
            pass
        return True

    while True:
        # Highlander Check: Suicide if not the One
        if not highlander_check():
            sys.exit(0)

        # Dynamic Persona Reload (Hot-Swapping)
        HUD.PERSONA = load_persona()
        theme = HUD.get_theme()
        PREFIX = theme["prefix"]

        cycle_start = time.time()
        print(f"\n{HUD.MAGENTA}--- CYCLE START: {time.strftime('%H:%M:%S')} ---")
        HUD.persona_log("INFO", f"Identity Verified: {theme.get('greeting', 'Unknown')}")

        for repo in TARGET_REPOS:
            process_repo(Path(repo), HUD.PERSONA)

        # Sleep Logic with Frequent Highlander Checks
        elapsed = time.time() - cycle_start
        sleep_time = max(0, INTERVAL_SECONDS - elapsed)
        print(f"{Fore.MAGENTA}--- CYCLE END. Sleeping for {int(sleep_time)}s ---")

        slept = 0
        chunk = 5
        while slept < sleep_time:
            # Check mandate every chunk
            if not highlander_check():
                HUD.persona_log("WARNING", "Highlander Mandate Lost during sleep. Terminating.")
                sys.exit(0)

            step = min(chunk, sleep_time - slept)
            time.sleep(step)
            slept += step

if __name__ == "__main__":
    try:
        daemon_loop()
    except KeyboardInterrupt:
        print(f"\n{Fore.RED}Shutdown Requested.")
        sys.exit(0)
    finally:
        # Cleanup Lock
        LOCK_FILE = Path(__file__).parent / "ravens.lock"
        if LOCK_FILE.exists():
            # Only remove if it contains our PID (in case of race/overwrite, though unlikely)
            try:
                if LOCK_FILE.read_text().strip() == str(os.getpid()):
                    LOCK_FILE.unlink()
            except Exception:
                pass
