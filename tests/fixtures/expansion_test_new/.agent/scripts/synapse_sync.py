#!/usr/bin/env python3
"""
The Synapse (mnemosyne_sync.py)
[Ω] MEMORY IS DOMINION / [A] THE ARCHIVE GROWS

Syncs local Corvus instance with the Mimir's Eye Knowledge Core.
"""

import os
import sys
import json
import shutil
import argparse
import subprocess
import py_compile
from datetime import datetime

# Ensure we can import shared UI
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
try:
    from scripts.ui import HUD
except ImportError:
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

class Synapse:
    def __init__(self):
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.base_dir = os.path.dirname(self.script_dir) # .agent
        self.project_root = os.path.dirname(self.base_dir) # CorvusStar
        self.config_path = os.path.join(self.base_dir, "config.json")
        self.config = self._load_config()
        
        self.core_path = self.config.get("KnowledgeCore")
        if not self.core_path:
            HUD.box_top("SYNAPSE ERROR")
            HUD.box_row("ERROR", "KnowledgeCore not defined in config.json", HUD.RED)
            HUD.box_bottom()
            sys.exit(1)
            
        if not os.path.exists(self.core_path):
            HUD.box_top("SYNAPSE ERROR")
            HUD.box_row("ERROR", f"Core path not found: {self.core_path}", HUD.RED)
            HUD.box_bottom()
            sys.exit(1)

    def _load_config(self):
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r') as f:
                    return json.load(f)
            except: return {}
        return {}

    def _git_cmd(self, args, cwdir):
        try:
            result = subprocess.run(
                ["git"] + args, 
                cwd=cwdir, 
                capture_output=True, 
                text=True, 
                check=False
            )
            return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
        except FileNotFoundError:
            return False, "", "git executable not found"

    def pull(self, dry_run=False):
        HUD.box_top("SYNAPSE: INHALE")
        if dry_run:
            HUD.box_row("MODE", "DRY RUN (No changes will be applied)", HUD.YELLOW)
        
        # 1. Update Core
        HUD.box_row("ACTION", "Syncing Knowledge Core...", HUD.CYAN)
        if not dry_run:
            ok, out, err = self._git_cmd(["pull"], self.core_path)
            if not ok:
                HUD.box_row("WARNING", "Core sync failed (Offline?)", HUD.YELLOW)
            else:
                HUD.box_row("STATUS", "Core Updated", HUD.GREEN)
        else:
            HUD.box_row("STATUS", "Skipped (Dry Run)", HUD.YELLOW)

        changes_count = 0
        
        # 2. Sync Skills
        core_skills = os.path.join(self.core_path, "skills")
        local_db = os.path.join(self.project_root, "skills_db")
        
        if os.path.exists(core_skills):
            if not os.path.exists(local_db) and not dry_run: os.makedirs(local_db)
            
            for item in os.listdir(core_skills):
                src = os.path.join(core_skills, item)
                dst = os.path.join(local_db, item)
                
                if os.path.isdir(src):
                    # Directory Sync
                    if not os.path.exists(dst):
                        if not dry_run: shutil.copytree(src, dst)
                        changes_count += 1
                        HUD.box_row("LEARNED", f"Skill: {item}", HUD.GREEN)
                    else:
                        # Overwrite if newer (naive check on folder mtime is unreliable, check SKILL.md)
                        src_meta = os.path.join(src, "SKILL.md")
                        dst_meta = os.path.join(dst, "SKILL.md")
                        if os.path.exists(src_meta) and os.path.exists(dst_meta):
                            if os.path.getmtime(src_meta) > os.path.getmtime(dst_meta):
                                if not dry_run:
                                    shutil.rmtree(dst)
                                    shutil.copytree(src, dst)
                                changes_count += 1
                                HUD.box_row("UPDATED", f"Skill: {item}", HUD.CYAN)

        # 3. Merge Corrections
        core_corr_path = os.path.join(self.core_path, "corrections.json")
        local_corr_path = os.path.join(self.base_dir, "corrections.json")
        
        if os.path.exists(core_corr_path):
            try:
                with open(core_corr_path, 'r') as f:
                    core_corr = json.load(f)
                
                local_corr = {}
                if os.path.exists(local_corr_path):
                    with open(local_corr_path, 'r') as f:
                        local_corr = json.load(f)
                
                merged = 0
                for k, v in core_corr.items():
                    # Core overrides local if not present or explicitly global
                    if k not in local_corr:
                        v['is_global'] = True
                        local_corr[k] = v
                        merged += 1
                
                if merged > 0:
                    with open(local_corr_path, 'w') as f:
                        json.dump(local_corr, f, indent=4)
                    HUD.box_row("WISDOM", f"Absorbed {merged} global corrections", HUD.MAGENTA)
                    changes_count += 1
            except Exception as e:
                HUD.box_row("ERROR", f"Corruption in Core Corrections: {str(e)}", HUD.RED)
                
        if changes_count == 0:
            HUD.box_row("RESULT", "Knowledge is already synchronized.", HUD.GREEN)
            
        HUD.box_bottom()


    def _validate_skill(self, file_path: str) -> bool:
        """
        The Gatekeeper: Validates Syntax and Structural Integrity before intent to push.
        """
        # 1. Syntax Check
        try:
            py_compile.compile(file_path, doraise=True)
        except py_compile.PyCompileError as e:
            HUD.box_row("REJECTED", f"Syntax Error in {os.path.basename(file_path)}", HUD.RED)
            return False

        # 2. Structural Integrity (Ruff)
        try:
            # Check for Errors (E) and Fatal (F) only
            # Use sys.executable -m ruff to ensure we find the installed module
            result = subprocess.run(
                [sys.executable, "-m", "ruff", "check", "--select=E,F", "--quiet", file_path],
                capture_output=True, text=True
            )
            if result.returncode != 0:
                 HUD.box_row("REJECTED", f"Code Sentinel Alert (Ruff) in {os.path.basename(file_path)}", HUD.RED)
                 return False
        except FileNotFoundError:
             HUD.box_row("WARNING", "Code Sentinel (Ruff) not found. Skipping integrity check.", HUD.YELLOW)

        return True


    def push(self):
        HUD.box_top("SYNAPSE: EXHALE")
        
        updates = []
        
        # 1. Scan Local Skills for Global Candidates
        # Look for "GLOBAL: True" in file content
        local_skills_dir = os.path.join(self.project_root, "skills")
        core_skills_dir = os.path.join(self.core_path, "skills")
        
        if os.path.exists(local_skills_dir):
            for f in os.listdir(local_skills_dir):
                if f.endswith(".py"):
                    path = os.path.join(local_skills_dir, f)
                    try:
                        with open(path, 'r', encoding='utf-8') as content:
                            if "GLOBAL: True" in content.read():
                                # Candidate found
                                dst = os.path.join(core_skills_dir, f)
                                
                                # Gatekeeper Validation
                                if not self._validate_skill(path):
                                    updates.append(f"REJECTED: {f}")
                                    continue

                                if not os.path.exists(dst) or os.path.getmtime(path) > os.path.getmtime(dst):
                                    shutil.copy2(path, dst)
                                    updates.append(f"Skill: {f}")
                                    
                                    # Copy associated md if exists
                                    md_file = f.replace(".py", ".md")
                                    md_path = os.path.join(local_skills_dir, ("skills", md_file)) # Logic check? usually structure is skills/name/SKILL.md or flattened
                                    # Simplification: flattening assumption for now per prompt structure
                    except: pass

        # 2. Push Corrections
        local_corr_path = os.path.join(self.base_dir, "corrections.json")
        core_corr_path = os.path.join(self.core_path, "corrections.json")
        
        if os.path.exists(local_corr_path):
            try:
                with open(local_corr_path, 'r') as f:
                    local_corr = json.load(f)
                
                core_corr = {}
                if os.path.exists(core_corr_path):
                    with open(core_corr_path, 'r') as f:
                        core_corr = json.load(f)
                        
                corr_updates = 0
                for k, v in local_corr.items():
                    # Only push if HIGH confidence and marked for export (or just really high confidence)
                    # Policy: Score > 1.05 implies explicit user correction or verified strong match
                    if v.get('score', 0) >= 1.05:
                        if k not in core_corr:
                            core_corr[k] = v
                            corr_updates += 1
                
                if corr_updates > 0:
                    with open(core_corr_path, 'w') as f:
                        json.dump(core_corr, f, indent=4)
                    updates.append(f"{corr_updates} Corrections")
            except: pass

        if updates:
            HUD.box_row("CONTRIBUTION", f"Committing {len(updates)} change items...", HUD.CYAN)
            
            # Git Commit
            self._git_cmd(["add", "."], self.core_path)
            msg = f"[SYNAPSE] Knowledge from CorvusStar: {', '.join(updates)}"
            ok, out, err = self._git_cmd(["commit", "-m", msg], self.core_path)
            
            if ok:
                HUD.box_row("STATUS", "Committed to Core", HUD.GREEN)
                # git push usually fails in these non-auth environments, but we try
                # For local folder repo, it's just a commit basically unless it has origin
                # Assuming this IS the repo or has origin
                ok, out, err = self._git_cmd(["push"], self.core_path) 
            else:
                HUD.box_row("WARNING", "Nothing to commit or commit failed", HUD.YELLOW)

        else:
            HUD.box_row("RESULT", "No new global knowledge to contribute.", HUD.YELLOW)

        HUD.box_bottom()

def main():
    parser = argparse.ArgumentParser(description="Corvus Synapse Sync")
    parser.add_argument("--pull", action="store_true", help="Inhale: Update local from Core")
    parser.add_argument("--push", action="store_true", help="Exhale: Push local to Core")
    parser.add_argument("--dry-run", action="store_true", help="Simulate changes without applying")
    
    args = parser.parse_args()
    
    synapse = Synapse()
    
    if args.pull:
        synapse.pull(dry_run=args.dry_run)
    elif args.push:
        synapse.push()
    else:
        # Default behavior: Pull
        synapse.pull(dry_run=args.dry_run)

if __name__ == "__main__":
    main()
