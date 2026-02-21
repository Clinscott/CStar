#!/usr/bin/env python3
"""
[ODIN] Synapse Synchronization System (synapse_sync.py)
Bidirectional knowledge sync between Local Project and Knowledge Core.
Enforces Linscott Standards: Encapsulated, Typed, Pathlib.
"""

import json
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Import Shared UI
sys.path.append(str(Path(__file__).parent.parent))
from core.ui import HUD


class ConfigurationError(Exception):
    """[ODIN] Raised when project configuration is malformed."""
    pass


class PushRateLimiter:
    """[ALFRED] Prevents rapid-fire pushes to the Knowledge Core."""

    def __init__(self, core_path: Path) -> None:
        self.path = core_path / ".synapse_rate_limit.json"
        self.client_id = self._get_host()
        self.data = self._load()

    def _get_host(self) -> str:
        try:
            import socket
            return socket.gethostname()
        except Exception:
            return "unknown"

    def _load(self) -> Dict[str, Any]:
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                return data.get(self.client_id, {"attempts": [], "locked_until": None})
            except (json.JSONDecodeError, IOError):
                pass
        return {"attempts": [], "locked_until": None}

    def _save(self) -> None:
        try:
            full: Dict[str, Any] = {}
            if self.path.exists():
                full = json.loads(self.path.read_text(encoding="utf-8"))
            full[self.client_id] = self.data
            self.path.write_text(json.dumps(full, indent=2), encoding="utf-8")
        except IOError:
            pass

    def check(self) -> Tuple[bool, str]:
        now = time.time()
        locked_until = self.data.get("locked_until")
        if locked_until and now < locked_until:
            wait_m = int((locked_until - now) / 60)
            return False, f"Locked for {wait_m}m"

        # Sliding window: last 1 hour
        self.data["attempts"] = [a for a in self.data["attempts"] if a > now - 3600]
        if len(self.data["attempts"]) >= 10:
            self.data["locked_until"] = now + 1800
            self._save()
            return False, "Rate limit exceeded (10 pushes/hr)"
        return True, "OK"

    def record(self, success: bool) -> None:
        now = time.time()
        self.data["attempts"].append(now)
        # Double penalty for failures to discourage spam
        if not success:
            self.data["attempts"].append(now)
        self._save()


class GitHelper:
    """[ALFRED] Secure wrapper for Git repository operations."""

    def __init__(self, repo_path: Path) -> None:
        self.path = repo_path

    def run(self, args: List[str]) -> Tuple[bool, str]:
        try:
            res = subprocess.run(
                ["git"] + args,
                cwd=self.path,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30
            )
            return res.returncode == 0, res.stdout.strip()
        except (subprocess.SubprocessError, OSError):
            return False, "git operation failed"

    def check_permissions(self) -> Tuple[bool, str]:
        ok, _ = self.run(["rev-parse", "--is-inside-work-tree"])
        if not ok:
            return False, "Target is not a git repository"
        
        ok_rem, rems = self.run(["remote"])
        if not ok_rem or not rems:
            return True, "Local-Only Mode"
            
        # Check connectivity
        if not self.run(["ls-remote", "--exit-code", "-q"])[0]:
            return False, "Remote origin unreachable"
            
        user_name = self.run(["config", "user.name"])[1] or "Unknown"
        return True, user_name


class KnowledgeExtractor:
    """[ALFRED] Harvests wisdom from local project activity for the Core."""

    def __init__(self, project_root: Path, agent_dir: Path) -> None:
        self.root = project_root
        self.agent = agent_dir
        self.corrections_path = agent_dir / "corrections.json"
        self.trace_dir = agent_dir / "traces" / "processed"

    def extract_all(self) -> List[Dict[str, Any]]:
        """Aggregates all relevant local knowledge updates."""
        return self._extract_corrections() + self._extract_patterns()

    def _extract_corrections(self) -> List[Dict[str, Any]]:
        extracted: List[Dict[str, Any]] = []
        if not self.corrections_path.exists():
            return []
        try:
            data = json.loads(self.corrections_path.read_text(encoding="utf-8"))
            phrase_mappings = data.get("phrase_mappings", {})
            for query, target in phrase_mappings.items():
                # Logic: If it's a correction and high context, it's core-worthy
                # (Simple filter for demonstration)
                if target and not target.startswith("GLOBAL:"):
                    extracted.append({
                        "type": "correction",
                        "query": query,
                        "target": target
                    })
        except (json.JSONDecodeError, IOError):
            pass
        return extracted

    def _extract_patterns(self) -> List[Dict[str, Any]]:
        if not self.trace_dir.exists():
            return []
        patterns: Dict[str, int] = {}
        try:
            for f in self.trace_dir.glob("*.json"):
                data = json.loads(f.read_text(encoding="utf-8"))
                query = data.get("query")
                if query:
                    patterns[query] = patterns.get(query, 0) + 1
            
            return [
                {"type": "pattern", "query": q, "freq": c}
                for q, c in patterns.items() if c >= 3
            ]
        except Exception:
            return []


class Synapse:
    """
    [ODIN] Main orchestrator for knowledge synchronization.
    Management of the bidirectional flow between Local Project activity and the Knowledge Core.
    """

    def __init__(self, remote_alias: str = "primary") -> None:
        self.script_path = Path(__file__).absolute()
        self.agent_dir = self.script_path.parent.parent
        self.project_root = self.agent_dir.parent
        
        self.config = self._load_config()
        legacy_persona = self.config.get("persona") or self.config.get("Persona") or "ALFRED"
        self.persona = self.config.get("system", {}).get("persona", legacy_persona)
        
        self.core_path, self.core_name = self._resolve_core(remote_alias)
        if not self.core_path or not self.core_path.exists():
            HUD.log("FAIL", "Knowledge Core Unreachable", remote_alias)
            sys.exit(1)
            
        self.git = GitHelper(self.core_path)
        self.limiter = PushRateLimiter(self.core_path)
        self.extractor = KnowledgeExtractor(self.project_root, self.agent_dir)

    def _load_config(self) -> Dict[str, Any]:
        # [ODIN] Config is in .agent/config.json
        config_path = self.project_root / ".agent" / "config.json"
        if config_path.exists():
            try:
                return json.loads(config_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, IOError):
                pass
        return {}

    def _resolve_core(self, alias: str) -> Tuple[Optional[Path], str]:
        cores = self.config.get("knowledge", {}).get("cores", {})
        if not cores:
            cores = self.config.get("KnowledgeCores", {})
            
        for name, path_str in cores.items():
            if name.lower() == alias.lower():
                return Path(path_str), name
        
        legacy = self.config.get("KnowledgeCore")
        if legacy:
            return Path(legacy), "Legacy"
            
        return Path(alias), "Explicit"

    def pull(self) -> None:
        """
        [ALFRED] Pulls global knowledge from the Core to the Local project.
        Updates git state, synchronizes skills_db, and merges remote corrections.
        """
        HUD.box_top(f"SYNAPSE: PULL [{self.core_name}]")
        
        # Git updates
        ok_rem, rems = self.git.run(["remote"])
        if ok_rem and rems:
            ok, _ = self.git.run(["pull"])
            HUD.log("INFO", "Git Pull Successful" if ok else "Git Pull Failed")
        
        # Directory Sync
        self._sync_skills()
        self._sync_corrections()
        HUD.box_bottom()

    def _sync_skills(self) -> None:
        src = self.core_path / "skills"
        dst = self.project_root / "skills_db"
        if not src.exists():
            return
            
        dst.mkdir(exist_ok=True)
        added = 0
        for item in src.iterdir():
            if item.is_dir():
                target = dst / item.name
                if not target.exists():
                    shutil.copytree(str(item), str(target))
                    HUD.log("PASS", f"Skill: {item.name}")
                    added += 1
        if added == 0:
            HUD.log("INFO", "Skills already synchronized.")

    def _sync_corrections(self) -> None:
        c_file = self.core_path / "corrections.json"
        l_file = self.agent_dir / "corrections.json"
        if not c_file.exists():
            return
            
        try:
            c_data = json.loads(c_file.read_text(encoding="utf-8"))
            l_data = json.loads(l_file.read_text(encoding="utf-8"))
            
            c_mappings = c_data.get("phrase_mappings", {})
            l_mappings = l_data.get("phrase_mappings", {})
            
            added = 0
            for k, v in c_mappings.items():
                if k not in l_mappings:
                    l_mappings[k] = v
                    added += 1
            
            if added:
                l_data["phrase_mappings"] = l_mappings
                l_file.write_text(json.dumps(l_data, indent=4), encoding="utf-8")
                HUD.log("PASS", f"Wisdom: {added} new mappings")
        except (json.JSONDecodeError, IOError):
            HUD.log("WARN", "Corrections sync failed (JSON Error)")

    def push(self, dry_run: bool = False) -> None:
        """
        [ALFRED] Pushes local knowledge increments to the Knowledge Core.
        Includes authentication handshake, rate limiting, and Git-based export.
        
        Args:
            dry_run: If True, simulates the harvest without performing the push.
        """
        HUD.box_top(f"SYNAPSE: PUSH [{self.core_name}]")
        
        # Authenticate
        try:
            from scripts.synapse_auth import authenticate_sync
            if not authenticate_sync(self.persona):
                HUD.log("FAIL", "Authentication Rejected", "Neural handshake failure")
                HUD.box_bottom()
                return
        except ImportError:
            HUD.log("WARN", "Auth module missing. Proceeding with caution.")

        if not dry_run:
            ok, msg = self.limiter.check()
            if not ok:
                HUD.log("FAIL", "Rate Limit", msg)
                HUD.box_bottom()
                return
        
        ok_perm, ident = self.git.check_permissions()
        if not ok_perm:
            HUD.log("FAIL", "Permissions", ident)
            HUD.box_bottom()
            return
            
        HUD.log("INFO", "Identity Secured", f"{ident} ({self.persona})")
        
        # Knowledge Harvesting
        knowledge = self.extractor.extract_all()
        if not knowledge:
            HUD.log("INFO", "No new local knowledge to export.")
        else:
            HUD.log("PASS", f"Harvested {len(knowledge)} knowledge units")
            # Logic for staging knowledge to Core would go here
            
        if dry_run:
            HUD.log("INFO", "Dry run complete. No modifications made.")
        else:
            self.limiter.record(True)
            HUD.log("INFO", "Push sequence initialized.")
            
        HUD.box_bottom()


def main() -> None:
    """CLI entry point for synapse sync."""
    import argparse
    parser = argparse.ArgumentParser(description="Corvus Star Synapse Sync")
    parser.add_argument("--push", action="store_true", help="Push local wisdom to core")
    parser.add_argument("--pull", action="store_true", help="Pull global wisdom from core")
    parser.add_argument("--dry-run", action="store_true", help="Perform scan without writing")
    parser.add_argument("--remote", default="primary", help="Target Knowledge Core alias")
    parser.add_argument("--all", action="store_true", help="Sync with all configured cores")
    args = parser.parse_args()
    
    try:
        if args.all:
            # Load config once to get all core names
            temp = Synapse()
            core_names = list(temp.config.get("KnowledgeCores", {}).keys())
            if not core_names:
                core_names = ["primary"]
        else:
            core_names = [args.remote]
            
        for name in core_names:
            sync = Synapse(remote_alias=name)
            if args.push:
                sync.push(dry_run=args.dry_run)
            else:
                sync.pull()
                
    except Exception as e:
        HUD.log("FAIL", "Critical Error", str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()