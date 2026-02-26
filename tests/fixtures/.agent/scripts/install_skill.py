import json
import os
import re
import shutil
import subprocess
import sys

from sv_engine import SovereignHUD


def _sanitize_skill_name(name):
    sanitized = name.replace("/", "").replace("\\", "").replace("..", "")
    return sanitized if re.match(r'^[a-zA-Z0-9_-]+$', sanitized) else None

def _validate_path(base, target):
    try:
        b, t = os.path.realpath(base), os.path.realpath(target)
        return os.path.commonpath([b, t]) == b
    except: return False

def _get_config(base_path):
    path = os.path.join(base_path, "config.json")
    try:
        with open(path, encoding='utf-8') as f: return json.load(f), None
    except Exception as e: return None, f"Config Error: {str(e)[:30]}"

def _verify_integrity(quarantine_zone):
    qmd = os.path.join(quarantine_zone, "SKILL.qmd")
    md = os.path.join(quarantine_zone, "SKILL.md")
    if os.path.exists(qmd) and os.path.getsize(qmd) > 0: return True, None
    if os.path.exists(md) and os.path.getsize(md) > 0: return True, None
    return False, "Missing/empty SKILL metadata (.qmd or .md)"

def _run_security_scan(quarantine_zone):
    scanner = os.path.join(os.path.dirname(__file__), "security_scan.py")
    if not os.path.exists(scanner): return -1, "Scanner missing"

    threat = 0
    for root, _, files in os.walk(quarantine_zone):
        for f in [f for f in files if f.endswith((".py", ".qmd", ".md"))]:
            try:
                res = subprocess.run([sys.executable, scanner, os.path.join(root, f)], capture_output=True, timeout=15)
                threat = max(threat, res.returncode)
                if res.stdout: print(res.stdout.decode('utf-8', errors='ignore'))
            except: threat = max(threat, 1)
    return threat, None

def _promote_skill(quarantine, dest):
    """Securely move skill from quarantine to final destination."""
    try:
        if os.path.exists(dest): shutil.rmtree(dest)
        shutil.move(quarantine, dest)
        return True
    except Exception as e:
        SovereignHUD.log("FAIL", "Promotion Failed", str(e)[:30])
        return False

def install_skill(skill_name, target_root=None):
    """[ALFRED] Refactored skill installer with isolated sub-phases and path validation."""
    name = _sanitize_skill_name(skill_name)
    base = target_root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config, err = _get_config(base)
    if not name or err or not config.get("FrameworkRoot"):
        SovereignHUD.log("FAIL", "Pre-install Check", err or "Invalid Name"); return

    src = os.path.join(config["FrameworkRoot"], "skills_db", name)
    qua = os.path.join(base, "quarantine", name)
    dst = os.path.join(base, "skills", name)

    if not all(_validate_path(base if "db" not in p[0] else config["FrameworkRoot"], p[1]) for p in [(src, src), (base, qua), (base, dst)]):
        SovereignHUD.log("CRITICAL", "Path Violation"); return

    if os.path.exists(dst):
        SovereignHUD.log("INFO", f"Skill '{name}' already installed."); return
    if not os.path.exists(src):
        SovereignHUD.log("FAIL", f"Skill '{name}' not found"); return

    try:
        if os.path.exists(qua): shutil.rmtree(qua)
        shutil.copytree(src, qua)

        ok, i_err = _verify_integrity(qua)
        if not ok: SovereignHUD.log("FAIL", i_err); shutil.rmtree(qua); return

        threat, s_err = _run_security_scan(qua)
        if threat >= 2: SovereignHUD.log("CRITICAL", "BLOCKED: Security Threat"); shutil.rmtree(qua); return
        if threat == 1:
            if input(f"{SovereignHUD.CYAN}>> Proceed with Warning? [y/N]: {SovereignHUD.RESET}").lower() != 'y':
                shutil.rmtree(qua); return

        if _promote_skill(qua, dst): SovereignHUD.log("PASS", f"Skill '{name}' deployed.")
    except Exception as e:
        SovereignHUD.log("FAIL", f"Install Crash: {str(e)[:40]}")
        if os.path.exists(qua): shutil.rmtree(qua)

if __name__ == "__main__":
    if len(sys.argv) > 1: install_skill(sys.argv[1])
    else: print("Usage: python install_skill.py <skill>")
