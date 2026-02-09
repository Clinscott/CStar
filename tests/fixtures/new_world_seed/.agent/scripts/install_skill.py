import json
import os
import shutil
import subprocess
import sys

from sv_engine import HUD


def install_skill(skill_name, target_root=None):
    if target_root:
        base_path = target_root
    else:
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config_path = os.path.join(base_path, "config.json")
    
    if not os.path.exists(config_path):
        print(f"Error: .agent/config.json not found.")
        return

    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    framework_root = config.get("FrameworkRoot")
    if not framework_root:
        print("Error: FrameworkRoot not defined in config.json")
        return

    source = os.path.join(framework_root, "skills_db", skill_name)
    
    # AIRLOCK PROTOCOL: Quarantine
    quarantine_zone = os.path.join(base_path, "quarantine", skill_name)
    final_dest = os.path.join(base_path, "skills", skill_name)

    if not os.path.exists(source):
        print(f"{HUD.RED}Error: Skill '{skill_name}' not found in registry.{HUD.RESET}")
        return

    if os.path.exists(final_dest):
        print(f"{HUD.YELLOW}Skill '{skill_name}' is already installed.{HUD.RESET}")
        return
        
    # Step 1: Quarantine
    if os.path.exists(quarantine_zone):
        shutil.rmtree(quarantine_zone)
    shutil.copytree(source, quarantine_zone)
    
    # Step 2: Scan
    scan_script = os.path.join(os.path.dirname(__file__), "security_scan.py")
    threat_level = 0
    
    # Scan every file
    for root, dirs, files in os.walk(quarantine_zone):
        for file in files:
            if file.endswith(".md") or file.endswith(".py"):
                fpath = os.path.join(root, file)
                result = subprocess.run(["python", scan_script, fpath], capture_output=True)
                if result.returncode > 0:
                    threat_level = max(threat_level, result.returncode)
                    print(result.stdout.decode('utf-8')) # Show Report

    # Step 3: Verdict
    if threat_level == 2: # CRITICAL
        print(f"{HUD.RED}>> BLOCKED: '{skill_name}' contains CRITICAL THREATS (Prompt Injection/Damage).{HUD.RESET}")
        print(f"{HUD.RED}>> DESTROYING QUARANTINED FILES...{HUD.RESET}")
        shutil.rmtree(quarantine_zone)
        sys.exit(1)
        
    if threat_level == 1: # WARNING
        print(f"{HUD.YELLOW}>> WARNING: Suspicious patterns detected.{HUD.RESET}")
        if HUD.PERSONA == "GOD" or HUD.PERSONA == "ODIN":
             prompt = f"{HUD.RED}>> [ODIN] OVERRIDE SECURITY PROTOCOL? (RISK ACKNOWLEDGED) [y/N]: {HUD.RESET}"
        else:
             prompt = f"{HUD.CYAN}>> Proceed with caution? [y/N]: {HUD.RESET}"
             
        choice = input(prompt).strip().lower()
        if choice != 'y':
            print(f"{HUD.YELLOW}>> ABORTED. Cleaning up.{HUD.RESET}")
            shutil.rmtree(quarantine_zone)
            return

    # Step 4: Promote
    if os.path.exists(quarantine_zone):
        shutil.move(quarantine_zone, final_dest)
        print(f"{HUD.GREEN}>> VERIFIED. Skill '{skill_name}' deployed to active matrix.{HUD.RESET}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        install_skill(sys.argv[1])
    else:
        print("Usage: python install_skill.py [skill_name]")
