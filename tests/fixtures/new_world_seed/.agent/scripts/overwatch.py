import json
import msvcrt
import os
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Tuple

# Import Shared UI
try:
    from src.core.sovereign_hud import SovereignHUD
except ImportError:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from src.core.sovereign_hud import SovereignHUD

def get_timestamp() -> str:
    """Returns formatted current time."""
    return datetime.now().strftime("%H:%M:%S")

def get_stats() -> Dict[str, int]:
    """
    Parses filesystem validation data (Fishtest & Rejections).
    
    Returns:
        Dict containing counts for 'cases', 'rejections', and 'war_zones'.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    project_root = os.path.dirname(base_dir)
    
    stats = {"cases": 0, "rejections": 0, "war_zones": 0}
    
    # 1. Fishtest Data
    db_path = os.path.join(project_root, "fishtest_data.json")
    if os.path.exists(db_path):
        try:
            with open(db_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                cases = data.get("test_cases", [])
                stats["cases"] = len(cases)
                # Count cases with conflicting tags
                stats["war_zones"] = len([c for c in cases if "ODIN" in c.get("tags", []) and "ALFRED" in c.get("tags", [])])
        except Exception: 
            pass # Silent fail during stats gathering is acceptable

    # 2. Rejections
    rej_path = os.path.join(base_dir, "traces", "quarantine", "REJECTIONS.md")
    if os.path.exists(rej_path):
        try:
            with open(rej_path, 'r', encoding='utf-8') as f:
                # Subtract header/padding lines (approx 3)
                stats["rejections"] = max(0, len(f.readlines()) - 3)
        except Exception: 
            pass
        
    return stats

def check_for_changes(last_stats: Dict[str, int], last_rej_count: int) -> Tuple[Dict[str, int], int]:
    """
    Compares current state to previous state and logs deltas.
    
    Args:
        last_stats: Previous stats dict.
        last_rej_count: Previous rejection file line count.
        
    Returns:
        Tuple of (current_stats, current_rej_count).
    """
    current_stats = get_stats()
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rej_path = os.path.join(base_dir, "traces", "quarantine", "REJECTIONS.md")
    
    # Check Cases
    delta_cases = current_stats["cases"] - last_stats["cases"]
    if delta_cases > 0:
        SovereignHUD.log("PASS", f"Ingested {delta_cases} new trace(s)", f"(Total: {current_stats['cases']})")
    
    # Check Rejections
    current_rej_count = 0
    if os.path.exists(rej_path):
        try:
            with open(rej_path, 'r', encoding='utf-8') as f:
                current_rej_count = len(f.readlines())
        except Exception: pass
            
    if current_rej_count > last_rej_count:
        SovereignHUD.log("WARN", "Trace Rejected by Crucible", f"(Total: {current_stats['rejections']})")
        
    if current_stats["war_zones"] > last_stats["war_zones"]:
         SovereignHUD.log("CRITICAL", "New War Zone Detected", f"(Review Conflict)")
         
    return current_stats, current_rej_count

if __name__ == "__main__":
    if "--help" in sys.argv:
        print(f"\n{SovereignHUD.BOLD}Neural Overwatch Utilities{SovereignHUD.RESET}")
        print("Usage: python overwatch.py")
        print("  Real-time dashboard for the Corvus Star Federated Network.")
        sys.exit(0)

    # Header
    print(f"\n{SovereignHUD.RED}{SovereignHUD.BOLD}Ω NEURAL OVERWATCH Ω{SovereignHUD.RESET}")
    print(f"{SovereignHUD.DIM}Monitoring Federated Network...{SovereignHUD.RESET}\n")
    
    SovereignHUD.log("INFO", "System Online", "Listening on mock_project/network_share")
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rej_path = os.path.join(base_dir, "traces", "quarantine", "REJECTIONS.md")
    
    last_rej_count = 0
    if os.path.exists(rej_path):
        try:
            with open(rej_path, 'r', encoding='utf-8') as f:
                last_rej_count = len(f.readlines())
        except: pass
            
    last_stats = get_stats()
    latency_data: List[float] = [] 
    pulse_count = 0
    
    while True:
        try:
            # Interactive Input - Wrapped for safety
            if os.name == 'nt':
                if msvcrt.kbhit():
                    key = msvcrt.getch().decode('utf-8').lower()
                    if key == 'q':
                        SovereignHUD.log("INFO", "Overwatch Shutdown")
                        sys.exit(0)
                    elif key == 'c':
                        os.system('cls')
                        # Reprint Header
                        print(f"\n{SovereignHUD.RED}{SovereignHUD.BOLD}Ω NEURAL OVERWATCH Ω{SovereignHUD.RESET}")
                        print(f"{SovereignHUD.DIM}Monitoring Federated Network...{SovereignHUD.RESET}\n") 
                        SovereignHUD.log("INFO", "Dashboard Cleared")
                    elif key == 'p':
                        # Purge Ledger
                        if os.path.exists(rej_path):
                            with open(rej_path, 'w', encoding='utf-8') as f:
                                f.write("# Rejection Ledger\n\n")
                            SovereignHUD.log("WARN", "Rejection Ledger Purged")
                            last_rej_count = 0
            
            # Update Logic (Throttled)
            if pulse_count % 20 == 0: # Approx 2s
                last_stats, last_rej_count = check_for_changes(last_stats, last_rej_count)
            
            # Heartbeat / Latency Check (every 60s approx -> 600 ticks)
            if pulse_count % 600 == 0:
                import subprocess
                res = subprocess.run(
                    ["python", os.path.join(base_dir, "scripts", "latency_check.py"), "3"], 
                    capture_output=True, text=True
                )
                if res.returncode == 0:
                        try:
                            lat = float(res.stdout.strip())
                            latency_data.append(lat)
                            if len(latency_data) > 20: latency_data.pop(0)
                            
                            status = "PASS" if lat < 100 else "WARN"
                            SovereignHUD.log(status, f"Engine Latency: {lat:.2f}ms", f"Trend: {SovereignHUD.render_sparkline(latency_data)}")
                        except ValueError: 
                            SovereignHUD.log("WARN", "Latency Parse Error", res.stdout.strip())
            
            time.sleep(0.1)
            pulse_count += 1
            
        except KeyboardInterrupt:
            print("\n")
            SovereignHUD.log("INFO", "Overwatch Shutdown")
            sys.exit(0)
        except Exception as e:
            SovereignHUD.log("FAIL", f"Monitor Error: {e}")
            time.sleep(5)
