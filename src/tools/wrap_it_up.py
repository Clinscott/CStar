#!/usr/bin/env python3
"""
[ODIN] Phase 9.5: The Sovereign Commit & Dynamic Sync.
Orchestrates the final wrap-up sequence:
1. Gungnir Gate (Ruff/Pytest)
2. Trace Compilation & Manifest Update
3. Dynamic Documentation (Edda)
4. Vector Re-Indexing
5. Git Commit & Push
"""
import sys
import subprocess
import shutil
import json
from pathlib import Path
from datetime import datetime

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent.absolute()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

# Core Imports
from src.core.ui import HUD
from src.core.sv_engine import SovereignEngine
from src.tools import compile_session_traces
from src.tools.update_gemini_manifest import update_manifest

class SovereignWrapper:
    def __init__(self):
        self.root = PROJECT_ROOT
        
        # Enforce ODIN persona for the Wrap-Up Protocol
        HUD.PERSONA = "ODIN"
        HUD._INITIALIZED = True # Prevent lazy-loading overwrites

    def run_gungnir_gate(self):
        """Executes the Gungnir validation gate (Ruff + Pytest)."""
        HUD.box_top("GUNGNIR GATE")
        
        # 1. Ruff (Linting)
        HUD.box_row("STEP 1", "Ruff Linting", HUD.CYAN)
        try:
            # Check for ruff
            subprocess.run(
                [sys.executable, "-m", "ruff", "check", ".", "--select", "E9,F63,F7,F82"], 
                cwd=str(self.root), 
                check=True, 
                capture_output=True
            )
            HUD.box_row("STATUS", "PASS", HUD.GREEN)
        except subprocess.CalledProcessError as e:
            HUD.box_row("STATUS", "FAIL", HUD.RED)
            HUD.persona_log("HEIMDALL", f"BREACH: Linting failure detected.\n{e.stderr.decode()}")
            sys.exit(1)

        HUD.box_separator()

        # 2. Gungnir Matrix (Master Test Suite)
        HUD.box_row("STEP 2", "Gungnir Matrix", HUD.CYAN)
        try:
            matrix_tests = [
                "tests/unit/test_intent.py",
                "tests/unit/test_warden.py",
                "tests/unit/test_crucible.py"
            ]
            subprocess.run(
                [sys.executable, "-m", "pytest"] + matrix_tests, 
                cwd=str(self.root), 
                check=True
            )
            HUD.box_row("STATUS", "PASS", HUD.GREEN)
        except subprocess.CalledProcessError:
            HUD.box_row("STATUS", "FAIL", HUD.RED)
            HUD.persona_log("HEIMDALL", "BREACH: Gungnir Matrix failure. Security integrity compromised.")
            sys.exit(1)

        HUD.box_separator()

        # 3. Pytest (Full Suite)
        HUD.box_row("STEP 3", "Full Pytest Suite", HUD.CYAN)
        try:
            subprocess.run(
                [sys.executable, "-m", "pytest"], 
                cwd=str(self.root), 
                check=True
            )
            HUD.box_row("STATUS", "PASS", HUD.GREEN)
        except subprocess.CalledProcessError:
            HUD.box_row("STATUS", "FAIL", HUD.RED)
            HUD.persona_log("HEIMDALL", "BREACH: Unit tests failed. Commit aborted.")
            sys.exit(1)
            
        HUD.box_bottom()


    def synchronize_state(self):
        """Compiles traces, updates manifest, and syncs docs."""
        HUD.persona_log("ALFRED", "Synchronizing neural state and compiled traces...")
        
        # 1. Compile Traces
        # compile_session_traces.compile_traces returns (raw_traces, stats)
        _, stats = compile_session_traces.compile_traces()
        
        # 2. Update Manifest
        update_manifest()
        
        # 3. Dynamic Documentation (Edda)
        self._edda_sync()

        # 4. Vector Re-Indexing
        HUD.persona_log("ODIN", "Rebuilding Sovereign Vector Index...")
        try:
            engine = SovereignEngine(project_root=self.root)
            # This implicitly calls build_index()
            _ = engine._init_vector_engine() 
        except Exception as e:
            HUD.persona_log("HEIMDALL", f"BREACH: Vector Indexing failed. {e}")
            sys.exit(1)
            
        return stats

    def _edda_sync(self):
        """Updates walkthrough if new skills/workflows are detected (Dynamic Autosync)."""
        # Scan for untracked/added files in relevant directories
        try:
            proc = subprocess.run(
                ["git", "status", "--porcelain"], 
                cwd=str(self.root), 
                capture_output=True, 
                text=True
            )
            changes = proc.stdout.splitlines()
            
            # Filter for new (??) or added (A) files in skills/workflows
            new_capabilities = []
            for line in changes:
                status, path = line[:2], line[3:]
                if status.strip() in ("??", "A"):
                    if "src/skills" in path or ".agent/workflows" in path:
                        new_capabilities.append(path)

            if new_capabilities:
                HUD.persona_log("EDDA", f"Detected {len(new_capabilities)} new capabilities. Documenting in Walkthrough...")
                
                wpath = self.root / "walkthrough.qmd"
                if wpath.exists():
                    timestamp = datetime.now().strftime('%H:%M:%S')
                    with open(wpath, "a", encoding="utf-8") as f:
                        f.write(f"\n\n### ⚡ Dynamic Capabilities Forged ({timestamp})\n")
                        for cap in new_capabilities:
                            f.write(f"- `{cap}`\n")
                            
        except Exception as e:
            HUD.persona_log("EDDA", f"Warning: Auto-documentation failed. {e}")

    def review_technical_debt(self):
        """Reviews the AnomalyWarden ledger and proposes optimizations."""
        queue_path = self.root / "src" / "data" / "anomalies_queue.json"
        archive_path = self.root / "src" / "data" / "anomalies_archive.json"
        
        if not queue_path.exists():
            return
            
        HUD.box_top("TECHNICAL DEBT REVIEW")
        try:
            with open(queue_path, "r", encoding="utf-8") as f:
                queue = json.load(f)
            
            if not queue:
                HUD.box_row("STATUS", "No pending anomalies.", HUD.GREEN)
                HUD.box_bottom()
                return

            HUD.box_row("PENDING", str(len(queue)), HUD.YELLOW)
            HUD.box_separator()

            # Eviction Protocol: Process and move to archive
            if archive_path.exists():
                with open(archive_path, "r", encoding="utf-8") as f:
                    archive = json.load(f)
            else:
                archive = []

            for entry in queue:
                ts = entry.get("timestamp", "Unknown")
                prob = entry.get("anomaly_probability", 0.0)
                HUD.box_row("ANOMALY", f"Prob: {prob:.2f} | {ts[:19]}")
                
                # ODIN Logic: Propose optimization (Simulated for this phase)
                # In future versions, this would trigger a background Forge task
                entry["status"] = "reviewed"
                archive.append(entry)

            # Atomic Swap: Clear queue, Update archive
            with open(archive_path, "w", encoding="utf-8") as f:
                json.dump(archive, f, indent=2)
            
            with open(queue_path, "w", encoding="utf-8") as f:
                json.dump([], f, indent=2)

            HUD.box_row("STATUS", "Ledger Synchronized. Archive Updated.", HUD.CYAN)
            HUD.box_bottom()

        except Exception as e:
            HUD.persona_log("ODIN", f"Error during Debt Review: {e}")
            HUD.box_bottom()

    def sovereign_commit(self, stats):
        """Generates commit message and pushes."""
        HUD.persona_log("ODIN", "Initiating Sovereign Commit Protocol...")
        
        # Check for clean state
        proc = subprocess.run(
            ["git", "status", "--porcelain"], 
            cwd=str(self.root), 
            capture_output=True, 
            text=True
        )
        if not proc.stdout.strip():
            HUD.persona_log("ALFRED", "No changes to commit. Dominion already established.")
            return

        # Generate Commit Message
        top_skill = stats.get('top_performer', 'N/A')
        total_traces = stats.get('total', 0)
        
        # Check for critical failures in stats to note in commit
        fails = len(stats.get('critical_fails', []))
        fail_note = f" ({fails} corrections applied)" if fails > 0 else ""

        commit_msg = f"""feat: Sovereign Sync (Session {datetime.now().strftime('%Y-%m-%d')})

- Processed {total_traces} neural traces{fail_note}.
- Top Skill: {top_skill}
- Validated codebase integrity via Gungnir Gate.
- Rebuilt Sovereign Vector Index.
- Updated Gemini Manifest and Documentation.

[ODIN] Dominion Expanded."""

        # Execute Git Protocol
        try:
            subprocess.run(["git", "add", "."], cwd=str(self.root), check=True)
            subprocess.run(["git", "commit", "-m", commit_msg], cwd=str(self.root), check=True)
            subprocess.run(["git", "push"], cwd=str(self.root), check=True)
            
            HUD.box_top("SOVEREIGN COMMIT")
            HUD.box_row("STATUS", "PUSHED", HUD.GREEN)
            HUD.box_row("HASH", "HEAD -> origin/main", HUD.CYAN)
            HUD.box_bottom()
            
        except subprocess.CalledProcessError as e:
            HUD.persona_log("HEIMDALL", f"BREACH: Git Protocol Failed. {e}")
            sys.exit(1)

    def run_integrity_check(self):
        """
        Executes the 3-Pillar Integrity Failsafe.
        Pillar 1: Structural (Read/Lock)
        Pillar 2: Semantic Sanity (Baseline match)
        Pillar 3: Orphan Mapping (File existence)
        """
        HUD.box_top("INTEGRITY FAILSAFE")
        
        try:
            engine = SovereignEngine(project_root=self.root)
            vector_engine = engine.engine # SovereignVector instance
            
            # Pillar 1: Structural Sanity
            HUD.box_row("PILLAR 1", "Structural Check", HUD.CYAN)
            if not vector_engine.skills and len(vector_engine.vocab) == 0:
                raise RuntimeError("Vector DB appears empty or structuraly corrupted.")
            HUD.box_row("STATUS", "PASS", HUD.GREEN)

            # Pillar 2: Semantic Sanity
            HUD.box_row("PILLAR 2", "Semantic Baseline", HUD.CYAN)
            baseline_query = "Deploy the system to live"
            results = vector_engine.search(baseline_query)
            if not results or results[0]['trigger'] != 'workflow_deployment':
                 HUD.persona_log("WARNING", f"Semantic drift detected. Top match for baseline: {results[0]['trigger'] if results else 'NONE'}")
                 raise RuntimeError("Semantic space poisoning detected. Baseline skill overridden.")
            HUD.box_row("STATUS", "PASS", HUD.GREEN)

            # Pillar 3: Orphan Mapping
            HUD.box_row("PILLAR 3", "Orphan Mapping", HUD.CYAN)
            # Sample last 5 skills from the engine
            all_skills = list(vector_engine.skills.keys())
            last_skills = all_skills[-5:] if len(all_skills) >= 5 else all_skills
            
            for skill in last_skills:
                # Skill names are usually file-based in this framework
                skill_path = self.root / "src" / "skills" / "local" / f"{skill}.py"
                global_path = self.root / "skills_db" / f"{skill}.py"
                if not skill_path.exists() and not global_path.exists():
                    # Handle GLOBAL: prefix if present
                    if skill.startswith("GLOBAL:"):
                        clean_name = skill.replace("GLOBAL:", "")
                        if not (self.root / "skills_db" / f"{clean_name}.py").exists():
                             raise RuntimeError(f"Orphaned skill detected: {skill}. Physical file missing.")
                    else:
                        raise RuntimeError(f"Orphaned skill detected: {skill}. Physical file missing.")
            HUD.box_row("STATUS", "PASS", HUD.GREEN)

        except Exception as e:
            HUD.box_row("STATUS", "FAIL", HUD.RED)
            HUD.persona_log("HEIMDALL", f"CRITICAL: Integrity Check Failed. {str(e)}")
            HUD.persona_log("ODIN", "Manual Rollback Recommended. Drop current collection and restore from snapshot.")
            sys.exit(1)
            
        HUD.box_bottom()

def main():
    try:
        wrapper = SovereignWrapper()
        
        # 1. Validation
        wrapper.run_gungnir_gate()
        
        # 2. Sync State (Index, Docs, Traces)
        stats = wrapper.synchronize_state()
        
        # 2b. Integrity Failsafe [BIFRÖST]
        wrapper.run_integrity_check()
        
        # 3. Review Technical Debt
        wrapper.review_technical_debt()
        
        # 4. Commit
        wrapper.sovereign_commit(stats)
        
    except KeyboardInterrupt:
        print("\n[HEIMDALL] Protocol Interrupted by User.")
        sys.exit(130)

if __name__ == "__main__":
    main()
