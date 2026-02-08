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

# Configuration
INTERVAL_SECONDS = 900  # 15 Minutes
TARGET_REPOS = [
    r"c:\Users\Craig\Corvus\CorvusStar",
    r"c:\Users\Craig\Corvus\KeepOS",
    r"c:\Users\Craig\Corvus\The Nexus"
]

# Ensure we can find the worker
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import sovereign_fish

# Import HUD from .agent/scripts/ui.py
agent_scripts = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".agent", "scripts")
sys.path.append(agent_scripts)
from ui import HUD

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
    """Determines the active persona from config.json."""
    try:
        # Try local config first, then agent config
        configs = ["config.json", ".agent/config.json"]
        for cfg in configs:
            if os.path.exists(cfg):
                import json
                with open(cfg, 'r') as f:
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
    
    # 2. Initialize
    HUD.persona_log("INFO", f"Sovereign Fish Automaton Initialized.")
    HUD.persona_log("INFO", f"Identity: {theme.get('greeting', 'Unknown')}")
    HUD.persona_log("INFO", f"Schedule: Every {INTERVAL_SECONDS}s")
    HUD.persona_log("INFO", f"Targets: {[Path(p).name for p in TARGET_REPOS]}")

    

    while True:
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
        elapsed = time.time() - cycle_start
        sleep_time = max(0, INTERVAL_SECONDS - elapsed)
        print(f"{Fore.MAGENTA}--- CYCLE END. Sleeping for {int(sleep_time)}s ---")
        time.sleep(sleep_time)

if __name__ == "__main__":
    try:
        daemon_loop()
    except KeyboardInterrupt:
        print(f"\n{Fore.RED}Shutdown Requested.")
        sys.exit(0)
