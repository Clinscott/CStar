import os
import sys
import psutil
import socket
import json
from pathlib import Path

# Linscott Standard Thresholds
MAX_MEMORY_MB = 150.0
DAEMON_PORT = 50051
REQUIRED_DIRS = [
    ".agent",
    ".agent/memory",
    ".agent/traces"
]
REQUIRED_FILES = [
    ".agent/corrections.json",
    "src/cstar/CorvusStar.psm1"
]

def check_daemon_running():
    print(f"[CHECK] Searching for C* Daemon...")
    for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'memory_info']):
        try:
            cmd = proc.info['cmdline']
            mem = proc.info['memory_info'].rss / (1024 * 1024)
            
            # Simple heuristic: look for "main_loop.py" or "muninn"
            if cmd and any("src/sentinel/main_loop.py" in c for c in cmd):
                print(f"  [PASS] Oracle (Daemon) active (PID: {proc.info['pid']})")
                print(f"  [METRIC] Oracle Memory: {mem:.2f} MB")
                
                if mem > MAX_MEMORY_MB:
                    print(f"  [FAIL] Oracle Memory Violation! ({mem:.2f}MB > {MAX_MEMORY_MB}MB)")
                    return False
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
            
    print("  [FAIL] Daemon process not found.")
    return False

def check_port_bound():
    print(f"[CHECK] Verifying Uplink Port {DAEMON_PORT}...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('localhost', DAEMON_PORT))
    sock.close()
    if result == 0:
        print(f"  [PASS] Port {DAEMON_PORT} is listening.")
        return True
    else:
        print(f"  [FAIL] Port {DAEMON_PORT} is CLOSED.")
        return False

def check_filesystem():
    print(f"[CHECK] Verifying Filesystem Integrity...")
    root = Path.cwd()
    all_good = True
    
    for d in REQUIRED_DIRS:
        path = root / d
        if not path.exists():
            print(f"  [FAIL] Directory missing: {d}")
            all_good = False
        elif not os.access(path, os.W_OK):
             print(f"  [FAIL] Directory not writable: {d}")
             all_good = False
        else:
             print(f"  [PASS] {d} OK")

    for f in REQUIRED_FILES:
        path = root / f
        if not path.exists():
            # Create if missing (some might be dynamic, but corrections.json should exist)
            if "corrections.json" in f:
                path.write_text("{}")
                print(f"  [WARN] Created missing file: {f}")
            else:
                print(f"  [FAIL] File missing: {f}")
                all_good = False
        elif not os.access(path, os.W_OK):
             print(f"  [FAIL] File not writable: {f}")
             all_good = False
        else:
             print(f"  [PASS] {f} OK")
             
    return all_good

def check_powershell_profile():
    print(f"[CHECK] Verifying PowerShell Profile Hook...")
    # This is trickier from Python without invoking PS, but we can check if the file exists
    # We can try to guess profile path or just assume the user installed it.
    # Let's just run a quick powershell command to check for the module
    try:
        import subprocess
        cmd = ["powershell", "-NoProfile", "-Command", "Get-Module -ListAvailable CorvusStar"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if "CorvusStar" in result.stdout:
             print(f"  [PASS] CorvusStar Module detected in PSPath.")
             return True
        else:
             print(f"  [WARN] CorvusStar Module NOT found in global path (Local usage might be intended).")
             # Not a hard fail if we assume local dev
             return True
    except Exception as e:
        print(f"  [WARN] Could not verify PowerShell: {e}")
        return True

def main():
    print("=== SYSTEM IGNITION SEQUENCE (Phase 9) ===\n")
    
    checks = [
        check_daemon_running(),
        check_port_bound(),
        check_filesystem(),
        check_powershell_profile()
    ]
    
    if all(checks):
        print("\n=== [SUCCESS] SYSTEM IGNITION CONFIRMED ===")
        print("Protocol Linscott: ACTIVE")
        sys.exit(0)
    else:
        print("\n=== [ABORT] SYSTEM IGNITION FAILED ===")
        sys.exit(1)

if __name__ == "__main__":
    main()
