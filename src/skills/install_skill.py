import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

from src.core.sovereign_hud import SovereignHUD

def install_skill(skill_name: str, target_root: str | Path | None = None) -> None:
    return SkillInstaller.install(skill_name, target_root)

def _get_config(base_path: str | Path) -> tuple[dict | None, str | None]:
    return SkillInstaller._get_config(base_path)

def _sanitize_skill_name(name: str) -> str | None:
    return SkillInstaller._sanitize_name(name)

class SkillInstaller:
    """[A.L.F.R.E.D.] Orchestration logic for Corvus Star skill installation."""

    @staticmethod
    def _sanitize_name(name: str) -> str | None:
        """Rejects names with illegal characters or path traversal attempts."""
        if not re.match(r'^[a-zA-Z0-9_-]+$', name):
            return None
        return name

    @staticmethod
    def _validate_path(base: str | Path, target: str | Path) -> bool:
        """Ensures the target path is within the base directory."""
        try:
            b, t = os.path.realpath(base), os.path.realpath(target)
            return os.path.commonpath([b, t]) == b
        except (ValueError, OSError):
            return False

    @staticmethod
    def _get_config(base_path: str | Path) -> tuple[dict | None, str | None]:
        """Loads the configuration from the target root."""
        path = os.path.join(base_path, "config.json")
        try:
            with open(path, encoding='utf-8') as f:
                return json.load(f), None
        except Exception as e:
            return None, f"Config Error: {str(e)[:30]}"

    @staticmethod
    def _verify_integrity(quarantine_zone: str | Path) -> tuple[bool, str | None]:
        """Checks for the existence of required metadata files."""
        qmd = os.path.join(quarantine_zone, "SKILL.qmd")
        md = os.path.join(quarantine_zone, "SKILL.md")
        if os.path.exists(qmd) and os.path.getsize(qmd) > 0:
            return True, None
        if os.path.exists(md) and os.path.getsize(md) > 0:
            return True, None
        return False, "Missing/empty SKILL metadata (.qmd or .md)"

    @staticmethod
    def _run_security_scan(quarantine_zone: str | Path) -> tuple[int, str | None]:
        """Executes a security scan on the quarantined skill."""
        framework_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        scanner = os.path.join(framework_root, "src", "tools", "security_scan.py")
        if not os.path.exists(scanner):
            return -1, "Scanner missing"

        threat = 0
        for root, _, files in os.walk(quarantine_zone):
            for f in [f for f in files if f.endswith((".py", ".qmd", ".md"))]:
                try:
                    res = subprocess.run([sys.executable, scanner, os.path.join(root, f)], capture_output=True, timeout=15)
                    threat = max(threat, res.returncode)
                    if res.stdout:
                        print(res.stdout.decode('utf-8', errors='ignore'))
                except (subprocess.SubprocessError, OSError):
                    threat = max(threat, 1)
        return threat, None

    @staticmethod
    def _promote_skill(quarantine: str | Path, dest: str | Path) -> bool:
        """Securely move skill from quarantine to final destination."""
        try:
            if os.path.exists(dest):
                shutil.rmtree(dest)
            shutil.move(quarantine, dest)
            return True
        except Exception as e:
            SovereignHUD.log("FAIL", "Promotion Failed", str(e)[:30])
            return False

    @staticmethod
    def _execute_installation_logic(src: str | Path, qua: str | Path, dst: str | Path, framework_root: str | Path) -> None:
        """Core logic for file operations and validations."""
        if os.path.exists(qua):
            shutil.rmtree(qua)
        os.makedirs(os.path.dirname(qua), exist_ok=True)
        shutil.copytree(src, qua)

        # Validate
        valid, v_err = SkillInstaller._verify_integrity(qua)
        if not valid:
            SovereignHUD.log("FAIL", "Integrity Check", v_err)
            return

        # Scan
        threat, s_err = SkillInstaller._run_security_scan(qua)
        if threat > 0 or s_err:
            SovereignHUD.log("FAIL", "Security Breach", s_err or f"Threat Level {threat}")
            return

        # Promote
        if SkillInstaller._promote_skill(qua, dst):
            from src.core.promotion_registry import PromotionRegistry
            registry = PromotionRegistry(framework_root)
            
            # Collect all files in the promoted skill
            promoted_files = []
            for root, _, files in os.walk(dst):
                for f in files:
                    promoted_files.append(Path(os.path.join(root, f)))
            
            registry.register_promotion(os.path.basename(dst), promoted_files)
            SovereignHUD.log("SUCCESS", f"Skill '{os.path.basename(dst)}' installed and registered.")

    @staticmethod
    def install(skill_name: str, target_root: str | Path | None = None) -> None:
        """Main entry point for skill installation."""
        name = SkillInstaller._sanitize_name(skill_name)
        base = target_root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        config, err = SkillInstaller._get_config(base)
        
        # Access nested system config
        framework_root = config.get("system", {}).get("framework_root") if config else None

        if not name or err or not framework_root:
            SovereignHUD.log("FAIL", "Pre-install Check", err or "Invalid Name/Root")
            return

        src = os.path.join(framework_root, "skills_db", name)
        qua = os.path.join(base, "quarantine", name)
        dst = os.path.join(base, "skills", name)

        # Path Validation
        paths_to_validate = [(src, src), (base, qua), (base, dst)]
        if not all(SkillInstaller._validate_path(base if "db" not in p[0] else framework_root, p[1]) for p in paths_to_validate):
            SovereignHUD.log("CRITICAL", "Path Violation")
            return

        if os.path.exists(dst):
            SovereignHUD.log("INFO", f"Skill '{name}' already installed.")
            return
        if not os.path.exists(src):
            SovereignHUD.log("FAIL", f"Skill '{name}' not found")
            return

        try:
            SkillInstaller._execute_installation_logic(src, qua, dst, framework_root)
        except Exception as e:
            SovereignHUD.log("FAIL", f"Install Crash: {str(e)[:40]}")
            if os.path.exists(qua):
                shutil.rmtree(qua)

if __name__ == "__main__":
    if len(sys.argv) > 2:
        SkillInstaller.install(sys.argv[1], target_root=sys.argv[2])
    elif len(sys.argv) > 1:
        SkillInstaller.install(sys.argv[1])
    else:
        print("Usage: python install_skill.py <skill> [target_root]")
