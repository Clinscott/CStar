import sys
import os
import time
import shutil
import json
import subprocess
from pathlib import Path

# Add script directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from sv_engine import HUD
try:
    from merge_traces import merge_traces
    from latency_check import measure_startup
except ImportError:
    # Ensure merge_traces can be imported even if running from root
    pass

# --- CONFIGURATION ---
BASE_PATH = os.path.dirname(current_dir) # .agent
PROJECT_ROOT = os.path.dirname(BASE_PATH)
NETWORK_SHARE = os.path.join(PROJECT_ROOT, "mock_project", "network_share")
FISHTEST_DB = os.path.join(PROJECT_ROOT, "fishtest_data.json")
PROCESSED_DIR = os.path.join(BASE_PATH, "traces", "processed")
QUARANTINE_DIR = os.path.join(BASE_PATH, "traces", "quarantine")
STAGING_DIR = os.path.join(BASE_PATH, "traces", "staging")
REJECTION_LEDGER = os.path.join(QUARANTINE_DIR, "REJECTIONS.md")


THEMES = {
    "ODIN": {
        "TITLE": "THE CRUCIBLE (GATEKEEPER)",
        "DETECTED": "INTRUDER DETECTED",
        "PASS": "STRENGTH ADDED",
        "FAIL": "WEAKNESS PURGED",
        "COLOR_MAIN": HUD.RED
    },
    "ALFRED": {
        "TITLE": "NETWORK WATCHER (INTEGRATION)",
        "DETECTED": "NEW TRACE DETECTED",
        "PASS": "INTEGRATION COMPLETE",
        "FAIL": "REGRESSION PREVENTED",
        "COLOR_MAIN": HUD.CYAN
    }
}

def get_theme():
    # Load config dynamically to allow runtime switching
    config_path = os.path.join(BASE_PATH, "config.json")
    try:
        with open(config_path, 'r', encoding='utf-8') as f: config = json.load(f)
        p = config.get("Persona", "ALFRED").upper()
        if p in ["GOD", "ODIN"]: return THEMES["ODIN"]
    except: pass
    return THEMES["ALFRED"] # Default

def run_fishtest():
    """Runs the fishtest.py script and returns True if successful."""
    try:
        # Run fishtest.py in a subprocess to separate memory states
        result = subprocess.run(
            ["python", "fishtest.py"], 
            cwd=PROJECT_ROOT, 
            capture_output=True, 
            text=True
        )
        return result.returncode == 0
    except Exception as e:
        print(f"Fishtest Error: {e}")
        return False

def log_rejection(filename, reason):
    """Logs a rejection to the REJECTIONS.md file in the quarantine directory."""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    theme = get_theme()
    persona = "ODIN" if theme["TITLE"].startswith("THE CRUCIBLE") else "ALFRED"
    
    # Create file with header if it doesn't exist
    if not os.path.exists(REJECTION_LEDGER):
        with open(REJECTION_LEDGER, 'w', encoding='utf-8') as f:
            f.write("# Rejection Ledger\n\n| Timestamp | Filename | Persona | Reason |\n| --- | --- | --- | --- |\n")
    
    with open(REJECTION_LEDGER, 'a', encoding='utf-8') as f:
        f.write(f"| {timestamp} | {filename} | {persona} | {reason} |\n")

def process_file(file_path):
    theme = get_theme()
    filename = os.path.basename(file_path)
    
    # 0. Move to Staging (Isolation)
    if not os.path.exists(STAGING_DIR): os.makedirs(STAGING_DIR)
    staging_path = os.path.join(STAGING_DIR, filename)
    try:
        shutil.move(file_path, staging_path)
    except Exception as e:
        print(f"Failed to stage file: {e}")
        return

    print("\n")
    HUD.box_top(theme["TITLE"])
    HUD.box_row("SCANNING", filename, theme["COLOR_MAIN"])
    
    # 1. Backup
    backup_path = FISHTEST_DB + ".bak"
    shutil.copy2(FISHTEST_DB, backup_path)
    
    # 2. Ingest (From Staging)
    try:
        merge_res = subprocess.run(
            ["python", os.path.join(current_dir, "merge_traces.py"), STAGING_DIR, FISHTEST_DB],
            capture_output=True, text=True
        )
        
        if merge_res.returncode != 0:
            raise Exception("Merge failed")
            
    except Exception as e:
        HUD.box_row("ERROR", "INGEST FAILED", HUD.RED)
        if os.path.exists(staging_path): 
            shutil.move(staging_path, os.path.join(QUARANTINE_DIR, filename))
            log_rejection(filename, f"Ingest Failure: {str(e)}")
        if os.path.exists(backup_path): shutil.move(backup_path, FISHTEST_DB)
        HUD.box_bottom()
        return

    # 3. The Law of Latency (Phase A)
    HUD.box_row("PROFILING", "MEASURING LATENCY...", HUD.YELLOW)
    baseline = measure_startup(3)
    HUD.box_row("BASELINE", f"{baseline:.2f}ms", HUD.CYAN)

    # 4. The Ordeal (Fishtest)
    passed = run_fishtest()
    
    # 5. Post-Ordeal Latency Check
    new_latency = measure_startup(3)
    delta = new_latency - baseline
    
    latency_passed = delta <= 5.0
    
    if passed and latency_passed:
        HUD.box_row("VERDICT", theme["PASS"], HUD.GREEN)
        HUD.box_row("LATENCY", f"{new_latency:.2f}ms (Δ {delta:+.2f}ms)", HUD.GREEN)
        # Commit: Delete backup
        if os.path.exists(backup_path): os.remove(backup_path)
        
        # Move from Staging/Processed to Final Processed
        ingested_path = os.path.join(STAGING_DIR, "processed", filename)
        if os.path.exists(ingested_path):
             shutil.move(ingested_path, os.path.join(PROCESSED_DIR, filename))
        
    else:
        if not passed:
            HUD.box_row("VERDICT", theme["FAIL"], HUD.RED)
            reason = "Regression: Failed Fishtest Ordeal"
        elif not latency_passed:
            HUD.box_row("VERDICT", "LATENCY REJECTION", HUD.RED)
            HUD.box_row("LATENCY", f"{new_latency:.2f}ms (Δ {delta:+.2f}ms)", HUD.RED)
            reason = f"Latency Breach: {delta:.2f}ms exceeds 5ms limit"
        
        # Rollback
        shutil.copy2(backup_path, FISHTEST_DB)
        os.remove(backup_path)
        
        # Quarantine
        ingested_path = os.path.join(STAGING_DIR, "processed", filename)
        if os.path.exists(ingested_path):
            shutil.move(ingested_path, os.path.join(QUARANTINE_DIR, filename))
            log_rejection(filename, reason)

    HUD.box_bottom()

def watch():
    print(f"{HUD.CYAN}>> The Crucible is active. Watching: {NETWORK_SHARE}...{HUD.RESET}")
    print(f"{HUD.CYAN_DIM}(Press Ctrl+C to stop){HUD.RESET}")
    
    while True:
        try:
            files = [f for f in os.listdir(NETWORK_SHARE) if f.endswith('.json')]
            if files:
                for f in files:
                    process_file(os.path.join(NETWORK_SHARE, f))
            time.sleep(3) # Pulse
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    if not os.path.exists(PROCESSED_DIR): os.makedirs(PROCESSED_DIR)
    if not os.path.exists(QUARANTINE_DIR): os.makedirs(QUARANTINE_DIR)
    watch()
