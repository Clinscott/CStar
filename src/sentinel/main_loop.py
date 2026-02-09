"""
Sovereign Fish: The Outer Loop (Daemon)
Identity: ODIN
Purpose: Orchestrate the Sovereign Fish agents across the Corvus Cluster.
"""

import time
import subprocess
import logging
import sys
import os
from pathlib import Path
from colorama import Fore, Style, init

# Initialize Colorama
init(autoreset=True)

# Load Environment Variables from .env or .env.local
try:
    from dotenv import load_dotenv
    # Try explicit .env.local first (common context pattern)
    env_local = Path(__file__).parent / ".env.local"
    if env_local.exists():
        load_dotenv(dotenv_path=env_local)
    else:
        # Fallback to default .env search
        load_dotenv()
except ImportError:
    pass  # python-dotenv not installed, rely on system env

# Configuration
INTERVAL_SECONDS = 900  # 15 Minutes
TARGET_REPOS = [
    r"c:\Users\Craig\Corvus\CorvusStar",
    r"c:\Users\Craig\Corvus\KeepOS",
    r"c:\Users\Craig\Corvus\The Nexus"
]

# Add project root to path
project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.sentinel import sovereign_fish
from src.core.ui import HUD

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
    except subprocess.CalledProcessError as e:
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
            with open(cfg_path, 'r') as f:
                data = json.load(f)
                p = data.get("persona") or data.get("Persona")
                if p: return p.upper()
    except Exception:
        pass
    return "ODIN" # Default to the All-Father

def daemon_loop():
    # 1. Load Persona
    HUD.PERSONA = load_persona()
    theme = HUD.get_theme()
    
    PREFIX = theme["prefix"]
    MAIN_COLOR = theme["main"]

    PREFIX = theme["prefix"]
    MAIN_COLOR = theme["main"]

    # --- SINGLETON CHECK ---
    # Use absolute path to ensure lock is found regardless of CWD
    LOCK_FILE = Path(__file__).parent / "sentinel.lock"
    
    if LOCK_FILE.exists():
        try:
            old_pid = int(LOCK_FILE.read_text().strip())
            # Check if process is actually running
            import psutil
            if psutil.pid_exists(old_pid):
                print(f"{Fore.RED}[ERROR] Sentinel is already running (PID: {old_pid}). Exiting.")
                return
        except (ValueError, ImportError):
            # lock file corrupted or psutil missing, ignore verify
            pass
            
    # Create Lock
    LOCK_FILE.write_text(str(os.getpid()))
    
    # 2. Initialize
    HUD.persona_log("INFO", f"Sovereign Fish Automaton Initialized.")
    HUD.persona_log("INFO", f"Identity: {theme.get('greeting', 'Unknown')}")
    HUD.persona_log("INFO", f"Schedule: Every {INTERVAL_SECONDS}s")
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
        except:
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
            repo_path = Path(repo)
            repo_name = repo_path.name
            
            if not repo_path.exists():
                logging.warning(f"[{repo_name}] [SKIP] Path not found.")
                continue
                
            print(f"{Fore.WHITE}Checking {repo_name}...")
            
            # 1. Dirty Check
            if not is_clean(repo_path):
                print(f"{Fore.YELLOW}  -> Dirty Working Tree. SKIPPING.")
                logging.info(f"[{repo_name}] [SKIP] Dirty working tree.")
                continue
            
            # 2. Isolation
            original_branch = ensure_branch(repo_path)
            
            # 3. Execution
            try:
                # Pass persona to the worker
                changed = sovereign_fish.run(str(repo_path))
                
                # 4. Commit (If changed)
                if changed:
                    ts = time.strftime("%Y-%m-%d %H:%M")
                    if HUD.PERSONA == "ALFRED":
                        commit_msg = f"🧹 Alfred: Tying up loose ends [{ts}]"
                    else:
                        commit_msg = f"🐟 Sovereign Fish: Auto-improvement [{ts}]"
                        
                    git_cmd(repo_path, ["add", "."])
                    git_cmd(repo_path, ["commit", "-m", commit_msg])
                    HUD.persona_log("SUCCESS", f"Changes Committed ({commit_msg})")
                    logging.info(f"[{repo_name}] [COMMIT] {commit_msg}")
                else:
                    HUD.persona_log("INFO", "No changes needed.")
                    
            except Exception as e:
                HUD.persona_log("ERROR", f"EXECUTION ERROR: {e}")
                logging.error(f"[{repo_name}] [EXEC_ERROR] {e}")
            
            # 5. Cleanup
            restore_branch(repo_path, original_branch)
            
        # Sleep Logic
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
        LOCK_FILE = Path(__file__).parent / "sentinel.lock"
        if LOCK_FILE.exists():
            # Only remove if it contains our PID (in case of race/overwrite, though unlikely)
            try:
                if LOCK_FILE.read_text().strip() == str(os.getpid()):
                    LOCK_FILE.unlink()
            except:
                pass
