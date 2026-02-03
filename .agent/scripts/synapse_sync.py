#!/usr/bin/env python3
"""
The Synapse (mnemosyne_sync.py)
[Ω] MEMORY IS DOMINION / [A] THE ARCHIVE GROWS

Syncs local Corvus instance with the Mimir's Eye Knowledge Core.
Hardened with [Alfred's Manor Inspection] security protocols.
Enhanced with Federated Learning and Multi-Remote support.
"""

import os
import sys
import json
import shutil
import argparse
import subprocess
import py_compile
import time
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from collections import defaultdict

# Ensure we can import shared UI
try:
    from ui import HUD
except ImportError:
    # Fallback
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from ui import HUD
    # Fallback
    class HUD:
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
        @staticmethod
        def box_separator(): print("-" * 10)
        @staticmethod
        def log(l, m, c=None): print(f"[{l}] {m}")

class ConfigurationError(Exception):
    """Raised when configuration is invalid or missing."""
    pass

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
                with open(self.path, 'r', encoding='utf-8') as f:
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

class KnowledgeExtractor:
    """
    Extracts learnable knowledge from a project instance.
    """
    def __init__(self, project_root: str, base_dir: str):
        self.project_root = project_root
        self.base_dir = base_dir
        self.trace_dir = os.path.join(base_dir, "traces", "processed")
        self.config = self._load_learning_config()
    
    def _load_learning_config(self) -> dict:
        config_path = os.path.join(self.base_dir, "config.json")
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f).get("LearningConfig", {})
        except:
            return {"categories": ["corrections", "patterns"]}
    
    def extract_all(self) -> list[dict]:
        extractions = []
        categories = self.config.get("categories", [])
        
        if "corrections" in categories:
            extractions.extend(self._extract_corrections())
        if "patterns" in categories:
            extractions.extend(self._extract_patterns())
        if "thesaurus" in categories:
            extractions.extend(self._extract_thesaurus())
        
        return extractions
    
    def _extract_corrections(self) -> list[dict]:
        corrections_path = os.path.join(self.base_dir, "corrections.json")
        if not os.path.exists(corrections_path): return []
        
        try:
            with open(corrections_path, 'r', encoding='utf-8') as f:
                data_file = json.load(f)
        except: return []
        
        phrase_mappings = data_file.get("phrase_mappings", {})
        extractions = []
        
        for query, target in phrase_mappings.items():
            # Skip if already marked as global trigger
            if target.startswith("GLOBAL:"): continue
            
            # Skip project-specific queries
            if any(x in query.lower() for x in ["c:\\", "/home/", ".py", ".js"]): continue
            
            extractions.append({
                "type": "correction",
                "query": query,
                "trigger": target,
                "confidence": 1.1, # Phrase mappings are 100% confidence by definition
                "source_project": os.path.basename(self.project_root)
            })
        return extractions

    def _extract_patterns(self) -> list[dict]:
        if not os.path.exists(self.trace_dir): return []
        queries = []
        for trace_file in Path(self.trace_dir).glob("*.json"):
            try:
                with open(trace_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, list):
                    queries.extend([t.get("query", "") for t in data if t.get("query")])
                elif data.get("query"):
                    queries.append(data["query"])
            except: continue
        
        if len(queries) < 10: return []
        
        pattern_counts = defaultdict(int)
        for query in queries:
            tokens = query.lower().split()
            for i in range(len(tokens) - 1): pattern_counts[" ".join(tokens[i:i+2])] += 1
            for i in range(len(tokens) - 2): pattern_counts[" ".join(tokens[i:i+3])] += 1
            
        extractions = []
        for pattern, count in pattern_counts.items():
            if count >= 3:
                extractions.append({
                    "type": "pattern",
                    "pattern": pattern,
                    "occurrences": count,
                    "source_project": os.path.basename(self.project_root)
                })
        return extractions[:20]

    def _extract_thesaurus(self) -> list[dict]:
        updates_path = os.path.join(self.base_dir, "thesaurus_updates.json")
        if not os.path.exists(updates_path): return []
        try:
            with open(updates_path, 'r', encoding='utf-8') as f:
                updates = json.load(f)
        except: return []
        
        extractions = []
        for word, data in updates.items():
            if data.get("votes", 0) >= 3:
                extractions.append({
                    "type": "thesaurus",
                    "word": word,
                    "weight": data.get("weight", 1.0),
                    "synonyms": data.get("synonyms", []),
                    "votes": data["votes"],
                    "source_project": os.path.basename(self.project_root)
                })
        return extractions

class Synapse:
    def __init__(self, remote_alias: str = "primary"):
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.base_dir = os.path.dirname(self.script_dir) # .agent
        self.project_root = os.path.dirname(self.base_dir) 
        self.config_path = os.path.join(self.base_dir, "config.json")
        self.config = self._load_json_safe(self.config_path)
        
        self.remote_alias = remote_alias
        self.core_path, self.remote_source = self._resolve_remote(remote_alias)
        
        if not self.core_path:
            HUD.box_top("SYNAPSE ERROR")
            HUD.box_row("REMOTE", f"'{remote_alias}'", HUD.RED)
            HUD.box_row("ERROR", "Knowledge Core unreachable or not configured", HUD.RED)
            HUD.box_bottom()
            sys.exit(1)
            
        self.rate_limiter = PushRateLimiter(self.core_path)
        self.security_logger = SecurityEventLogger(os.path.join(self.core_path, ".synapse_audit.log"))
        self.extractor = KnowledgeExtractor(self.project_root, self.base_dir)

    def _load_json_safe(self, file_path: str, max_size_mb: int = 10) -> dict:
        try:
            if not os.path.exists(file_path): return {}
            file_size = os.path.getsize(file_path)
            if file_size > max_size_mb * 1024 * 1024: return {}
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
        except: return {}

    def _resolve_remote(self, alias: str) -> tuple[str, str]:
        alias = (alias or "primary").strip().lower()
        cores = self.config.get("KnowledgeCores", {})
        
        if alias in cores:
            path = cores[alias]
            if os.path.exists(path): return path, f"Remote: {alias}"
            
        for k, v in cores.items():
            if k.lower() == alias and os.path.exists(v): return v, f"Remote: {k}"
            
        legacy = self.config.get("KnowledgeCore")
        if legacy and os.path.exists(legacy): return legacy, "Legacy (fallback)"
        
        return None, "No valid remote"

    def list_remotes(self):
        HUD.box_top("KNOWLEDGE CORES")
        cores = self.config.get("KnowledgeCores", {})
        legacy = self.config.get("KnowledgeCore")
        
        if not cores and not legacy:
            HUD.box_row("STATUS", "No cores configured", HUD.YELLOW)
        else:
            seen = set()
            for alias, path in cores.items():
                active = " [ACTIVE]" if alias.lower() == self.remote_alias.lower() else ""
                exists = os.path.exists(path)
                status = "ONLINE" if exists else "OFFLINE"
                color = HUD.GREEN if exists else HUD.RED
                HUD.box_row(alias.upper(), f"{path} [{status}]{active}", color)
                seen.add(os.path.realpath(path))
            
            if legacy and os.path.realpath(legacy) not in seen:
                exists = os.path.exists(legacy)
                status = "ONLINE" if exists else "OFFLINE"
                color = HUD.GREEN if exists else HUD.RED
                HUD.box_row("LEGACY", f"{legacy} [{status}]", color)
        HUD.box_bottom()

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
            if '\x00' in target_path: return False
            return os.path.commonpath([base_abs, target_abs]) == base_abs
        except: return False

    def _validate_filename(self, filename: str) -> bool:
        if not filename or ".." in filename or "/" in filename or "\\" in filename or filename.startswith("."):
            return False
        dangerous = {'.exe', '.dll', '.so', '.dylib', '.bat', '.cmd', '.ps1', '.sh'}
        if os.path.splitext(filename)[1].lower() in dangerous: return False
        if unicodedata.normalize('NFC', filename) != filename: return False
        return True

    def _check_push_permission(self) -> tuple[bool, str]:
        # 1. Check if it's a git repo at all
        ok, out, err = self._git_cmd(["rev-parse", "--is-inside-work-tree"], self.core_path)
        if not ok: return False, "Path is not a git repository"
        
        # 2. Check for remotes
        ok, remotes, _ = self._git_cmd(["remote"], self.core_path)
        if not ok or not remotes.strip():
            # Local-only git repo: allow push (which will just be a commit)
            return True, "Local-Only (No Remote)"
            
        # 3. Check connectivity to default remote
        ok, out, err = self._git_cmd(["ls-remote", "--exit-code", "-q"], self.core_path)
        if not ok: return False, f"Remote unreachable: {err[:50]}"
        
        # 4. Dry-run push check
        ok, out, err = self._git_cmd(["push", "--dry-run", "--porcelain"], self.core_path)
        if not ok: return False, f"Push denied: {err[:50]}"
        
        ok, name, _ = self._git_cmd(["config", "user.name"], self.core_path)
        ok2, email, _ = self._git_cmd(["config", "user.email"], self.core_path)
        if not name or not email: return True, "Git Identity Missing (Using system default)"
        
        return True, f"{name} <{email}>"

    def pull(self, dry_run=False):
        HUD.box_top(f"SYNAPSE: INHALE ← {self.remote_alias.upper()}")
        
        # Check for remotes before pulling
        ok_rem, remotes, _ = self._git_cmd(["remote"], self.core_path)
        if not dry_run and ok_rem and remotes.strip():
            ok, _, err = self._git_cmd(["pull"], self.core_path)
            HUD.box_row("STATUS", "Core Updated" if ok else f"Pull failed: {err[:30]}", HUD.GREEN if ok else HUD.YELLOW)
        else:
            HUD.box_row("STATUS", "No remote to pull from", HUD.CYAN)

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
                        HUD.box_row("LEARNED", f"Skill: {item}", HUD.GREEN)

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
            HUD.box_row("WISDOM", f"Absorbed {merged} corrections", HUD.MAGENTA)
            changes += 1
        
        if changes == 0: HUD.box_row("RESULT", "Knowledge synchronized.", HUD.GREEN)
        HUD.box_bottom()

    def push(self, dry_run=False):
        HUD.box_top(f"SYNAPSE: EXHALE → {self.remote_alias.upper()}")
        
        # Layer 1: Rate Limit
        if not dry_run:
            allowed, reason = self.rate_limiter.check_rate_limit()
            if not allowed:
                HUD.box_row("REJECTED", reason, HUD.RED)
                self.security_logger.log("RATE_LIMIT", {"reason": reason})
                HUD.box_bottom(); return

        # Layer 2: Auth Check
        allowed, identity = self._check_push_permission()
        if not allowed:
            if not dry_run:
                HUD.box_row("FORBIDDEN", identity, HUD.RED)
                self.security_logger.log("AUTH_FAILURE", {"reason": identity})
                HUD.box_bottom(); return
            else:
                HUD.box_row("PREVIEW", "Auth/Remote failed, but continuing for dry-run", HUD.YELLOW)
                identity = "Dry-Run-User"
        
        HUD.box_row("AUTHORIZED", identity, HUD.GREEN)
        HUD.box_separator()
        
        HUD.box_row("PHASE", "Extracting Local Knowledge...", HUD.CYAN)
        extractions = self.extractor.extract_all()
        
        if not extractions:
            HUD.box_row("RESULT", "No new knowledge to contribute", HUD.YELLOW)
            HUD.box_bottom(); return

        HUD.box_row("PHASE", "Validating & Applying...", HUD.CYAN)
        updates = []
        
        # Create Core Skills Dir if missing
        c_skills_dir = os.path.join(self.core_path, "skills")
        if not dry_run and not os.path.exists(c_skills_dir):
            os.makedirs(c_skills_dir)
        
        # Merge extractions into Core
        c_corr_path = os.path.join(self.core_path, "corrections.json")
        c_corr = self._load_json_safe(c_corr_path)
        c_updates = 0
        
        for item in extractions:
            if item["type"] == "correction":
                c_corr[item["query"]] = {
                    "skill": item["trigger"],
                    "score": item["confidence"],
                    "is_global": True,
                    "source": item["source_project"]
                }
                c_updates += 1
        
        if c_updates > 0:
            if not dry_run:
                with open(c_corr_path, 'w', encoding='utf-8') as f: json.dump(c_corr, f, indent=4)
            updates.append(f"{c_updates} Corrections")

        # Also still support manual skills marked GLOBAL
        l_skills = os.path.join(self.project_root, "skills")
        if os.path.exists(l_skills):
            for f in os.listdir(l_skills):
                if f.endswith(".py"):
                    p = os.path.join(l_skills, f)
                    try:
                        with open(p, 'r', encoding='utf-8') as c:
                            content = c.read()
                            if "GLOBAL: True" in content and self._validate_skill(p):
                                dst = os.path.join(self.core_path, "skills", f)
                                if not os.path.exists(dst) or os.path.getmtime(p) > os.path.getmtime(dst):
                                    if not dry_run:
                                        shutil.copy2(p, dst)
                                    updates.append(f"Skill: {f}")
                    except: pass

        if updates:
            if dry_run:
                HUD.box_row("DRY-RUN", f"Would commit: {', '.join(updates)}", HUD.YELLOW)
                HUD.box_bottom(); return
                
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            self._git_cmd(["branch", f"backup/pre-push_{ts}"], self.core_path)
            self._git_cmd(["add", "."], self.core_path)
            msg = f"[SYNAPSE] Contribution from {identity}: {', '.join(updates)}"
            ok, _, _ = self._git_cmd(["commit", "-m", msg], self.core_path)
            
            # Only push if remotes exist
            ok_rem, remotes, _ = self._git_cmd(["remote"], self.core_path)
            if ok and ok_rem and remotes.strip():
                ok_push, _, err = self._git_cmd(["push"], self.core_path)
                if ok_push:
                    HUD.box_row("STATUS", "Knowledge Uploaded", HUD.GREEN)
                    self.security_logger.log("PUSH_SUCCESS", {"identity": identity, "updates": updates})
                else:
                    HUD.box_row("ERROR", f"Push failed: {err[:50]}", HUD.RED)
                    self.security_logger.log("PUSH_FAILURE", {"identity": identity, "error": err})
            elif ok:
                HUD.box_row("STATUS", "Knowledge Committed (Local Only)", HUD.GREEN)
        else:
            HUD.box_row("RESULT", "No items to contribute.", HUD.YELLOW)
        HUD.box_bottom()

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
    p.add_argument("--remote", default="primary", help="Knowledge Core alias")
    p.add_argument("--list-remotes", action="store_true")
    args = p.parse_args()
    
    s = Synapse(remote_alias=args.remote)
    if args.list_remotes:
        s.list_remotes()
    elif args.push:
        s.push(dry_run=args.dry_run)
    else:
        s.pull(dry_run=args.dry_run)

if __name__ == "__main__": main()
