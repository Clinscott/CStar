
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
from src.core.ui import HUD

def check_status():
    """Checks if the Ravens are in flight."""
    HUD.log("INFO", "Checking if the Ravens are in flight...")
    try:
        ps_cmd = (
            "$currentPid = $pid; "
            "Get-CimInstance Win32_Process -Filter \"Name LIKE 'python%' AND (CommandLine LIKE '%main_loop.py%' OR CommandLine LIKE '%src.sentinel.main_loop%')\" | "
            "Where-Object { $_.ProcessId -ne $currentPid -and $_.ParentProcessId -ne $currentPid } | "
            "Select-Object -ExpandProperty ProcessId"
        )
        result = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True)
        
        pids = [p.strip() for p in result.stdout.strip().splitlines() if p.strip()]
        if pids:
            HUD.log("SUCCESS", "The Ravens are in flight", f"(PIDs: {', '.join(pids)})")
        else:
            HUD.log("WARN", "The Ravens are grounded")
    except Exception as e:
        HUD.log("FAIL", f"Status Check Failed: {e}")

def recall_ravens():
    """Recalls the Ravens (terminates the daemon)."""
    HUD.log("INFO", "Initiating START-9 (Nuclear Termination)...")
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
        
        HUD.log("SUCCESS", "Ravens recalled and roost cleared.")
            
    except Exception as e:
        HUD.log("FAIL", f"Termination Protocol Failed: {e}")

def release_ravens():
    """Releases the Ravens in a new window."""
    HUD.log("INFO", "Releasing the Ravens...")
    try:
        project_dir = str(PROJECT_ROOT)
        # Use simple python if venv python not found (handled by shell mostly, but let's try to find venv)
        python_exe = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
        if not python_exe.exists():
            python_exe = "python"
        
        cmd_str = f"Set-Location '{project_dir}'; & '{python_exe}' -m src.sentinel.main_loop"
        
        ps_cmd = f"Start-Process powershell -ArgumentList '-NoExit', '-Command', \"{cmd_str}\""
        
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=True)
        HUD.log("SUCCESS", "The Ravens take flight.")
    except Exception as e:
        HUD.log("FAIL", f"Deployment Failed: {e}")

def main():
    args = sys.argv[1:]
    if "-status" in args:
        check_status()
    elif any(x in args for x in ["-end", "-kill", "-recall"]):
        recall_ravens()
    else:
        release_ravens()

if __name__ == "__main__":
    main()
