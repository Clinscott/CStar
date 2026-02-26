#!/usr/bin/env python3
"""
The Synapse (mnemosyne_sync.py)
[Ω] MEMORY IS DOMINION / [A] THE ARCHIVE GROWS

Syncs local Corvus instance with the Mimir's Eye Knowledge Core.
Hardened with [Alfred's Manor Inspection] security protocols.
"""

import argparse
import json
import os
import py_compile
import shutil
import subprocess
import sys
import time
import unicodedata
from datetime import datetime

# Ensure we can import shared UI
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
try:
    from scripts.ui import SovereignHUD
except ImportError:
    # Fallback
    class SovereignHUD:
        RED = "\033[31m"
        GREEN = "\033[32m"
        YELLOW = "\033[33m"
        CYAN = "\033[36m"
        RESET = "\033[0m"
        BOLD = "\033[1m"
        MAGENTA = "\033[35m"
        PERSONA = "ODIN"
        @staticmethod
        def box_top(t): print(f"--- {t} ---")
        @staticmethod
        def box_row(l, v, c=None, dim_label=False): print(f"{l}: {v}")
        @staticmethod
        def box_bottom(): print("-" * 20)

class PushRateLimiter:
    """Prevent push spam and detect brute-force attempts."""
    RATE_LIMIT_FILE = ".synapse_rate_limit.json"
    MAX_ATTEMPTS_PER_HOUR = 10
    LOCKOUT_MINUTES = 30

    def __init__(self, core_path: str):
        self.path = os.path.join(core_path, self.RATE_LIMIT_FILE)
        self.data = self._load()

    def _load(self) -> dict:
        if os.path.exists(self.path):
            try:
                with open(self.path, encoding='utf-8') as f:
                    return json.load(f)
            except: pass
        return {"attempts": [], "locked_until": None}

    def _save(self):
        try:
            with open(self.path, 'w', encoding='utf-8') as f:
                json.dump(self.data, f)
        except: pass

    def check_rate_limit(self) -> tuple[bool, str]:
        now = time.time()
        if self.data.get("locked_until"):
            if now < self.data["locked_until"]:
                remaining = int((self.data["locked_until"] - now) / 60)
                return False, f"Locked out for {remaining} more minutes"
            else:
                self.data["locked_until"] = None

        one_hour_ago = now - 3600
        self.data["attempts"] = [a for a in self.data["attempts"] if a > one_hour_ago]
        if len(self.data["attempts"]) >= self.MAX_ATTEMPTS_PER_HOUR:
            self.data["locked_until"] = now + (self.LOCKOUT_MINUTES * 60)
            self._save()
            return False, f"Rate limit exceeded. Locked for {self.LOCKOUT_MINUTES} minutes"
        return True, "OK"

    def record_attempt(self, success: bool):
        self.data["attempts"].append(time.time())
        if not success: self.data["attempts"].append(time.time()) # Failed count double
        self._save()

class SecurityEventLogger:
    """Centralized security event logging."""
    def __init__(self, log_path: str):
        self.log_path = log_path

    def log(self, event_type: str, details: dict):
        entry = {
            "timestamp": datetime.now().isoformat(),
            "event": event_type,
            "details": details
        }
        try:
            with open(self.log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(entry) + "\n")
        except: pass

class Synapse:
    def __init__(self):
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.base_dir = os.path.dirname(self.script_dir) # .agent
        self.project_root = os.path.dirname(self.base_dir)
        self.config_path = os.path.join(self.base_dir, "config.json")
        self.config = self._load_json_safe(self.config_path)

        self.core_path = self.config.get("KnowledgeCore")
        if not self.core_path or not os.path.exists(self.core_path):
            SovereignHUD.box_top("SYNAPSE ERROR")
            SovereignHUD.box_row("ERROR", "KnowledgeCore invalid/missing in config.json", SovereignHUD.RED)
            SovereignHUD.box_bottom()
            sys.exit(1)

        self.rate_limiter = PushRateLimiter(self.core_path)
        self.security_logger = SecurityEventLogger(os.path.join(self.core_path, ".synapse_audit.log"))

    def _load_json_safe(self, file_path: str, max_size_mb: int = 10) -> dict:
        try:
            if not os.path.exists(file_path): return {}
            file_size = os.path.getsize(file_path)
            if file_size > max_size_mb * 1024 * 1024: return {}
            with open(file_path, encoding='utf-8') as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
        except: return {}

    def _git_cmd(self, args, cwdir):
        try:
            result = subprocess.run(
                ["git"] + args, cwd=cwdir, capture_output=True, text=True, check=False, timeout=30
            )
            return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
        except: return False, "", "git error"

    def _validate_path(self, base_dir: str, target_path: str) -> bool:
        try:
            base_abs = os.path.realpath(base_dir)
            target_abs = os.path.realpath(target_path)
            # Null byte check
            if '\x00' in target_path: return False
            # Common prefix check
            return os.path.commonpath([base_abs, target_abs]) == base_abs
        except: return False

    def _validate_filename(self, filename: str) -> bool:
        if not filename or ".." in filename or "/" in filename or "\\" in filename or filename.startswith("."):
            return False
        dangerous = {'.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.ps1', '.sh'}
        if os.path.splitext(filename)[1].lower() in dangerous: return False
        # Unicode normalization
        if unicodedata.normalize('NFC', filename) != filename: return False
        return True

    def _check_push_permission(self) -> tuple[bool, str]:
        # 1. Network/Git check
        ok, out, err = self._git_cmd(["ls-remote", "--exit-code", "-q"], self.core_path)
        if not ok: return False, "Remote unreachable or not a git repo"

        # 2. Dry-run auth check
        ok, out, err = self._git_cmd(["push", "--dry-run", "--porcelain"], self.core_path)
        if not ok: return False, f"Push denied: {err[:50]}"

        # 3. Identity check
        ok, name, _ = self._git_cmd(["config", "user.name"], self.core_path)
        ok2, email, _ = self._git_cmd(["config", "user.email"], self.core_path)
        if not name or not email: return False, "Git identity not configured"

        return True, f"{name} <{email}>"

    def pull(self, dry_run=False):
        SovereignHUD.box_top("SYNAPSE: INHALE")
        if not dry_run:
            ok, _, _ = self._git_cmd(["pull"], self.core_path)
            SovereignHUD.box_row("STATUS", "Core Updated" if ok else "Sync failed", SovereignHUD.GREEN if ok else SovereignHUD.YELLOW)

        changes = 0
        core_skills = os.path.join(self.core_path, "skills")
        local_db = os.path.join(self.project_root, "skills_db")

        if os.path.exists(core_skills):
            if not os.path.exists(local_db) and not dry_run: os.makedirs(local_db)
            for item in os.listdir(core_skills):
                if not self._validate_filename(item): continue
                src, dst = os.path.join(core_skills, item), os.path.join(local_db, item)
                if not self._validate_path(local_db, dst):
                    self.security_logger.log("PATH_TRAVERSAL", {"path": dst})
                    continue
                if os.path.isdir(src):
                    if not os.path.exists(dst):
                        if not dry_run: shutil.copytree(src, dst)
                        changes += 1
                        SovereignHUD.box_row("LEARNED", f"Skill: {item}", SovereignHUD.GREEN)

        # Merge Corrections
        core_corr = self._load_json_safe(os.path.join(self.core_path, "corrections.json"))
        local_corr_path = os.path.join(self.base_dir, "corrections.json")
        local_corr = self._load_json_safe(local_corr_path)
        merged = 0
        for k, v in core_corr.items():
            if k not in local_corr:
                v['is_global'] = True
                local_corr[k] = v
                merged += 1
        if merged > 0 and not dry_run:
            with open(local_corr_path, 'w', encoding='utf-8') as f: json.dump(local_corr, f, indent=4)
            SovereignHUD.box_row("WISDOM", f"Absorbed {merged} corrections", SovereignHUD.MAGENTA)
            changes += 1

        if changes == 0: SovereignHUD.box_row("RESULT", "Knowledge synchronized.", SovereignHUD.GREEN)
        SovereignHUD.box_bottom()

    def push(self):
        SovereignHUD.box_top("SYNAPSE: EXHALE")

        # Layer 1: Rate Limit
        allowed, reason = self.rate_limiter.check_rate_limit()
        if not allowed:
            SovereignHUD.box_row("REJECTED", reason, SovereignHUD.RED)
            self.security_logger.log("RATE_LIMIT", {"reason": reason})
            SovereignHUD.box_bottom(); return

        # Layer 2: Auth Check
        allowed, identity = self._check_push_permission()
        if not allowed:
            SovereignHUD.box_row("FORBIDDEN", identity, SovereignHUD.RED)
            self.security_logger.log("AUTH_FAILURE", {"reason": identity})
            SovereignHUD.box_bottom(); return

        SovereignHUD.box_row("AUTHORIZED", identity, SovereignHUD.GREEN)

        updates = []
        # Skill extraction
        l_skills = os.path.join(self.project_root, "skills")
        if os.path.exists(l_skills):
            for f in os.listdir(l_skills):
                if f.endswith(".py"):
                    p = os.path.join(l_skills, f)
                    try:
                        with open(p, encoding='utf-8') as c:
                            if "GLOBAL: True" in c.read() and self._validate_skill(p):
                                dst = os.path.join(self.core_path, "skills", f)
                                if not os.path.exists(dst) or os.path.getmtime(p) > os.path.getmtime(dst):
                                    shutil.copy2(p, dst); updates.append(f"Skill: {f}")
                    except: pass

        # Corrections extraction
        l_corr = self._load_json_safe(os.path.join(self.base_dir, "corrections.json"))
        c_corr_path = os.path.join(self.core_path, "corrections.json")
        c_corr = self._load_json_safe(c_corr_path)
        c_updates = 0
        for k, v in l_corr.items():
            if v.get('score', 0) >= 1.05 and k not in c_corr:
                c_corr[k] = v; c_updates += 1
        if c_updates > 0:
            with open(c_corr_path, 'w', encoding='utf-8') as f: json.dump(c_corr, f, indent=4)
            updates.append(f"{c_updates} Corrections")

        if updates:
            # Backup
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            self._git_cmd(["branch", f"backup/pre-push_{ts}"], self.core_path)

            self._git_cmd(["add", "."], self.core_path)
            msg = f"[SYNAPSE] Contribution from {identity}: {', '.join(updates)}"
            ok, _, _ = self._git_cmd(["commit", "-m", msg], self.core_path)
            if ok:
                ok_push, _, err = self._git_cmd(["push"], self.core_path)
                if ok_push:
                    SovereignHUD.box_row("STATUS", "Knowledge Uploaded", SovereignHUD.GREEN)
                    self.security_logger.log("PUSH_SUCCESS", {"identity": identity, "updates": updates})
                else:
                    SovereignHUD.box_row("ERROR", f"Push failed: {err[:50]}", SovereignHUD.RED)
                    self.security_logger.log("PUSH_FAILURE", {"identity": identity, "error": err})
            self.rate_limiter.record_attempt(ok and ok_push)
        else:
            SovereignHUD.box_row("RESULT", "No items to contribute.", SovereignHUD.YELLOW)
        SovereignHUD.box_bottom()

    def _validate_skill(self, file_path: str) -> bool:
        try:
            py_compile.compile(file_path, doraise=True)
            res = subprocess.run([sys.executable, "-m", "ruff", "check", "--select=E,F", "--quiet", file_path], capture_output=True)
            return res.returncode == 0
        except: return False

def main():
    p = argparse.ArgumentParser(description="Corvus Synapse Sync")
    p.add_argument("--pull", action="store_true")
    p.add_argument("--push", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    s = Synapse()
    if args.push: s.push()
    else: s.pull(dry_run=args.dry_run)

if __name__ == "__main__": main()
