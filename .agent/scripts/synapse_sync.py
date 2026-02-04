#!/usr/bin/env python3
import os
import sys
import json
import shutil
import subprocess
import time
import unicodedata
from datetime import datetime
from pathlib import Path
from ui import HUD

class PushRateLimiter:
    """[ALFRED] Prevents rapid-fire pushes to the Knowledge Core."""
    def __init__(self, core_path: str):
        self.path = os.path.join(core_path, ".synapse_rate_limit.json")
        self.client_id = self._get_host()
        self.data = self._load()

    def _get_host(self) -> str:
        try: import socket; return socket.gethostname()
        except: return "unknown"

    def _load(self) -> dict:
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    return json.load(f).get(self.client_id, {"attempts": [], "locked_until": None})
            except: pass
        return {"attempts": [], "locked_until": None}

    def _save(self):
        try:
            full = {}
            if os.path.exists(self.path):
                with open(self.path, "r", encoding="utf-8") as f: full = json.load(f)
            full[self.client_id] = self.data
            with open(self.path + ".tmp", "w", encoding="utf-8") as f: json.dump(full, f, indent=2)
            os.replace(self.path + ".tmp", self.path)
        except: pass

    def check(self) -> Tuple[bool, str]:
        now = time.time()
        if self.data.get("locked_until") and now < self.data["locked_until"]:
            return False, f"Locked for {int((self.data['locked_until'] - now)/60)}m"
        
        self.data["attempts"] = [a for a in self.data["attempts"] if a > now - 3600]
        if len(self.data["attempts"]) >= 10:
            self.data["locked_until"] = now + 1800
            self._save()
            return False, "Rate limit exceeded"
        return True, "OK"

    def record(self, success: bool):
        self.data["attempts"].append(time.time())
        if not success: self.data["attempts"].append(time.time())
        self._save()

class GitHelper:
    """[ALFRED] Secure wrapper for Git repository operations."""
    def __init__(self, path: str):
        self.path = path

    def run(self, args: list) -> tuple[bool, str]:
        try:
            res = subprocess.run(["git"] + args, cwd=self.path, capture_output=True, text=True, timeout=30)
            return res.returncode == 0, res.stdout.strip()
        except: return False, "git error"

    def check_permissions(self) -> tuple[bool, str]:
        ok, _ = self.run(["rev-parse", "--is-inside-work-tree"])
        if not ok: return False, "Not a git repo"
        ok_rem, rems = self.run(["remote"])
        if not ok_rem or not rems: return True, "Local-Only"
        if not self.run(["ls-remote", "--exit-code", "-q"])[0]: return False, "Remote unreachable"
        name = self.run(["config", "user.name"])[1] or "System"
        return True, name

class Synapse:
    def __init__(self, remote: str = "primary"):
        self.base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.root = os.path.dirname(self.base)
        with open(os.path.join(self.base, "config.json"), 'r') as f: self.cfg = json.load(f)
        
        self.c_path = self.cfg.get("KnowledgeCores", {}).get(remote) or self.cfg.get("KnowledgeCore")
        if not self.c_path or not os.path.exists(self.c_path):
            HUD.log("FAIL", "Core Unreachable", remote); sys.exit(1)
            
        self.git = GitHelper(self.c_path)
        self.limiter = PushRateLimiter(self.c_path)

    def pull(self):
        HUD.box_top("SYNAPSE: PULL")
        ok_rem, rems = self.git.run(["remote"])
        if ok_rem and rems:
            ok, _ = self.git.run(["pull"])
            HUD.log("INFO", "Git Pull" if ok else "Pull failed")
        
        self._sync_dir("skills", os.path.join(self.root, "skills_db"))
        self._sync_corrections()
        HUD.box_bottom()

    def _sync_dir(self, sub_dir: str, local_dst: str):
        src = os.path.join(self.c_path, sub_dir)
        if not os.path.exists(src): return
        os.makedirs(local_dst, exist_ok=True)
        for item in os.listdir(src):
            s_path, d_path = os.path.join(src, item), os.path.join(local_dst, item)
            if os.path.isdir(s_path) and not os.path.exists(d_path):
                shutil.copytree(s_path, d_path)
                HUD.log("PASS", f"Skill: {item}")

    def _sync_corrections(self):
        c_file, l_file = os.path.join(self.c_path, "corrections.json"), os.path.join(self.base, "corrections.json")
        try:
            with open(c_file, 'r') as f: c_data = json.load(f)
            with open(l_file, 'r') as f: l_data = json.load(f)
            added = 0
            for k, v in c_data.items():
                if k not in l_data: l_data[k] = {**v, "is_global": True}; added += 1
            if added:
                with open(l_file, 'w') as f: json.dump(l_data, f, indent=4)
                HUD.log("PASS", f" Wisdom: {added} corrections")
        except: pass

    def push(self, dry_run=False):
        HUD.box_top("SYNAPSE: PUSH")
        
        # Target 305: Persona Authentication
        from synapse_auth import authenticate_sync
        persona = self.cfg.get("Persona", "ALFRED")
        if not authenticate_sync(persona):
            HUD.log("FAIL", "Persona Verification Failed", "Neural Handshake Rejected")
            HUD.box_bottom()
            return
            
        if not dry_run:
            ok, msg = self.limiter.check()
            if not ok: HUD.log("FAIL", msg); HUD.box_bottom(); return
        
        ok, ident = self.git.check_permissions()
        if not ok: HUD.log("FAIL", ident); HUD.box_bottom(); return
        HUD.log("INFO", f"Identity Secured", f"{ident} ({persona})")

        # Extraction and staging logic follows...
        HUD.log("INFO", "Scanning for local knowledge increments...")
        HUD.box_bottom()

def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--push", action="store_true")
    p.add_argument("--pull", action="store_true")
    p.add_argument("--remote", default="primary")
    p.add_argument("--all", action="store_true")
    args = p.parse_args()
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(os.path.dirname(script_dir), "config.json"), 'r') as f:
        cfg = json.load(f)
    
    remotes = []
    if args.all:
        remotes = list(cfg.get("KnowledgeCores", {}).keys())
    else:
        remotes = [args.remote]
        
    for r_name in remotes:
        try:
            s = Synapse(remote=r_name)
            if args.push: s.push()
            else: s.pull()
        except Exception as e:
            HUD.log("FAIL", f"Sync Failed: {r_name}", str(e)[:30])

if __name__ == "__main__": main()
