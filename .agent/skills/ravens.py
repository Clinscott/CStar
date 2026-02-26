
"""
Ravens CLI (Daemon Manager)
Identity: ODIN
Purpose: Manage the Huginn & Muninn daemon process (Start/Stop/Status).
"""
import sys
import subprocess
import time
from pathlib import Path

# Bootstrap Project Root
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Imports (Now valid)
from src.core.sovereign_hud import SovereignHUD

def _get_running_pids():
    """Returns a list of PIDs for running Ravens processes."""
    try:
        ps_cmd = (
            "$currentPid = $pid; "
            "Get-CimInstance Win32_Process -Filter \"Name LIKE 'python%' AND (CommandLine LIKE '%main_loop.py%' OR CommandLine LIKE '%src.sentinel.main_loop%')\" | "
            "Where-Object { $_.ProcessId -ne $currentPid -and $_.ParentProcessId -ne $currentPid } | "
            "Select-Object -ExpandProperty ProcessId"
        )
        result = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
        return [p.strip() for p in result.stdout.strip().splitlines() if p.strip()]
    except Exception:
        return []

def check_status():
    """Checks the status of the Gungnir Spear."""
    SovereignHUD.log("INFO", "Scanning the Roost...")
    pids = _get_running_pids()
    
    # Check for Gungnir Calculus Infrastructure
    weights_path = PROJECT_ROOT / "src" / "core" / "weights.json"
    calc_path = PROJECT_ROOT / "src" / "core" / "metrics.py"
    has_calc = weights_path.exists() and calc_path.exists()
    
    if pids:
        SovereignHUD.log("SUCCESS", "THE RAVENS ARE IN FLIGHT", f"(PIDs: {', '.join(pids)})")
        SovereignHUD.log("INFO", "Alfred is active and providing Overwatch for the swarm.")
    elif has_calc:
        SovereignHUD.log("WARN", "THE RAVENS ARE GROUNDED (IDLE)")
        SovereignHUD.log("SUCCESS", "ALFRED IS WATCHING", "(Gungnir Calculus is Armed and Initialized)")
        
        # Check for recent observations
        suggestions_path = PROJECT_ROOT / ".agent" / "ALFRED_SUGGESTIONS.md"
        if suggestions_path.exists():
            import os
            mtime = os.path.getmtime(suggestions_path)
            last_obs = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime))
            SovereignHUD.log("INFO", f"Last Alfred Observation: {last_obs}")
    else:
        SovereignHUD.log("WARN", "THE RAVENS ARE GROUNDED")
        SovereignHUD.log("FAIL", "THE REALM IS UNPROTECTED", "(Gungnir Calculus not found)")

def recall_ravens():
    """Recalls the Ravens (terminates the daemon)."""
    SovereignHUD.log("INFO", "Initiating START-9 (Nuclear Termination)...")
    try:
        ps_kill = (
            "$currentPid = $pid; "
            "$targets = Get-CimInstance Win32_Process -Filter \"Name LIKE 'python%' AND (CommandLine LIKE '%main_loop.py%' OR CommandLine LIKE '%src.sentinel.main_loop%')\"; "
            "if ($targets) { "
            "  $targets | Where-Object { $_.ProcessId -ne $currentPid } | ForEach-Object { "
            "    $p = $_; "
            "    Get-CimInstance Win32_Process -Filter \"ParentProcessId = $($p.ProcessId)\" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; "
            "    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue "
            "  }"
            "}"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_kill], capture_output=True)
        
        # Cleanup Lock File
        lock_file = PROJECT_ROOT / "src" / "sentinel" / "ravens.lock"
        if lock_file.exists():
            lock_file.unlink()
        
        SovereignHUD.log("SUCCESS", "Ravens recalled and roost cleared.")
            
    except Exception as e:
        SovereignHUD.log("FAIL", f"Termination Protocol Failed: {e}")

def release_ravens():
    """Releases the Ravens in a new window."""
    # Check if already running
    pids = _get_running_pids()
    if pids:
        SovereignHUD.log("WARN", "The Ravens are already in flight.", f"(PIDs: {', '.join(pids)})")
        return

    SovereignHUD.log("INFO", "Releasing the Ravens...")
    try:
        project_dir = str(PROJECT_ROOT)
        # Use simple python if venv python not found (handled by shell mostly, but let's try to find venv)
        python_exe = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
        if not python_exe.exists():
            python_exe = "python"
        
        cmd_str = f"Set-Location '{project_dir}'; & '{python_exe}' -m src.sentinel.main_loop"
        
        ps_cmd = f"Start-Process powershell -ArgumentList '-NoExit', '-Command', \"{cmd_str}\""
        
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=True)
        SovereignHUD.log("SUCCESS", "The Ravens take flight.")
    except Exception as e:
        SovereignHUD.log("FAIL", f"Deployment Failed: {e}")

def learn(n_cycles=1):
    """Starts the Sovereign Test Harness Cycle."""
    SovereignHUD.log("INFO", f"Initiating {n_cycles} Cycle(s) of Manual Learning...")
    try:
        test_script = PROJECT_ROOT / "tests" / "harness" / "manual_learn.py"
        if not test_script.exists():
            SovereignHUD.log("FAIL", "Manual learn script not found at tests/harness/manual_learn.py")
            return

        # Run via sys.executable
        subprocess.run([sys.executable, str(test_script), f"N={n_cycles}"], check=False)
    except Exception as e:
        SovereignHUD.log("FAIL", f"Failed to start manual learn: {e}")

def main():
    args = sys.argv[1:]
    if "-status" in args:
        check_status()
    elif any(x in args for x in ["-end", "-kill", "-recall"]):
        recall_ravens()
    elif "-learn" in args:
        n_cycles = 5
        for arg in args:
            if arg.startswith("N=") or arg.startswith("n="):
                try:
                    n_cycles = int(arg.split("=")[1])
                except (ValueError, IndexError):
                    SovereignHUD.log("WARN", f"Invalid N value: {arg}. Defaulting to 5.")
        learn(n_cycles)
    else:
        release_ravens()

if __name__ == "__main__":
    main()
