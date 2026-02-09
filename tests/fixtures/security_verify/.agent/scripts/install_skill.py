import os
import sys
import shutil
import json
import subprocess
import re
from sv_engine import HUD

def _sanitize_skill_name(name):
    """Purify skill name."""
    sanitized = name.replace("/", "").replace("\\", "").replace("..", "")
    if not re.match(r'^[a-zA-Z0-9_-]+$', sanitized):
        return None
    return sanitized

def _validate_path(base, target):
    """Ensure path is within base."""
    try:
        b = os.path.realpath(base)
        t = os.path.realpath(target)
        return os.path.commonpath([b, t]) == b
    except: return False

def install_skill(skill_name, target_root=None):
    safe_name = _sanitize_skill_name(skill_name)
    if not safe_name:
        print(f"{HUD.RED}Error: Invalid skill name pattern: {skill_name}{HUD.RESET}")
        return

    if target_root:
        base_path = target_root
    else:
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config_path = os.path.join(base_path, "config.json")
    
    if not os.path.exists(config_path):
        print(f"Error: .agent/config.json not found.")
        return

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except:
        print("Error: Corrupt config.json")
        return
    
    framework_root = config.get("FrameworkRoot")
    if not framework_root:
        print("Error: FrameworkRoot not defined in config.json")
        return

    source = os.path.join(framework_root, "skills_db", safe_name)
    if not _validate_path(os.path.join(framework_root, "skills_db"), source):
        print(f"{HUD.RED}Error: Path traversal attempt blocked.{HUD.RESET}")
        return

    # AIRLOCK PROTOCOL: Quarantine
    quarantine_zone = os.path.join(base_path, "quarantine", safe_name)
    final_dest = os.path.join(base_path, "skills", safe_name)
    
    if not _validate_path(base_path, quarantine_zone) or not _validate_path(base_path, final_dest):
        print(f"{HUD.RED}Error: Installation target outside project scope.{HUD.RESET}")
        return

    if not os.path.exists(source):
        print(f"{HUD.RED}Error: Skill '{safe_name}' not found in registry.{HUD.RESET}")
        return

    if os.path.exists(final_dest):
        print(f"{HUD.YELLOW}Skill '{safe_name}' is already installed.{HUD.RESET}")
        return
        
    # Step 1: Quarantine
    if os.path.exists(quarantine_zone):
        shutil.rmtree(quarantine_zone)
    shutil.copytree(source, quarantine_zone)
    
    # Step 1.5: Integrity Check (SovereignFish Item 69)
    # Ensure mandatory files exist and are not empty
    mandatory_files = ["SKILL.md"]
    for mf in mandatory_files:
        mf_path = os.path.join(quarantine_zone, mf)
        if not os.path.exists(mf_path) or os.path.getsize(mf_path) == 0:
            print(f"{HUD.RED}>> INTEGRITY FAILURE: Missing or empty {mf} in '{safe_name}'.{HUD.RESET}")
            shutil.rmtree(quarantine_zone)
            return
    
    
    # Step 2: Scan
    scan_script = os.path.join(os.path.dirname(__file__), "security_scan.py")
    threat_level = 0
    
    # Scan every file
    for root, dirs, files in os.walk(quarantine_zone):
        for file in files:
            if file.endswith(".md") or file.endswith(".py"):
                fpath = os.path.join(root, file)
                try:
                    res = subprocess.run([sys.executable, scan_script, fpath], capture_output=True, timeout=10)
                    if res.returncode > 0:
                        threat_level = max(threat_level, res.returncode)
                        print(res.stdout.decode('utf-8')) # Show Report
                except: pass

    # Step 3: Verdict
    if threat_level == 2: # CRITICAL
        print(f"{HUD.RED}>> BLOCKED: '{safe_name}' contains CRITICAL THREATS.{HUD.RESET}")
        print(f"{HUD.RED}>> DESTROYING QUARANTINED FILES...{HUD.RESET}")
        shutil.rmtree(quarantine_zone)
        sys.exit(1)
        
    if threat_level == 1: # WARNING
        print(f"{HUD.YELLOW}>> WARNING: Suspicious patterns detected.{HUD.RESET}")
        prompt = f"{HUD.CYAN}>> Proceed with Caution? [y/N]: {HUD.RESET}"
             
        choice = input(prompt).strip().lower()
        if choice != 'y':
            print(f"{HUD.YELLOW}>> ABORTED. Cleaning up.{HUD.RESET}")
            shutil.rmtree(quarantine_zone)
            return

    # Step 4: Promote
    if os.path.exists(quarantine_zone):
        shutil.move(quarantine_zone, final_dest)
        print(f"{HUD.GREEN}>> VERIFIED. Skill '{safe_name}' deployed to active matrix.{HUD.RESET}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        install_skill(sys.argv[1])
    else:
        print("Usage: python install_skill.py [skill_name]")
