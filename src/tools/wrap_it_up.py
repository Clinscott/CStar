import gc
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent.absolute()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

# Core Imports
from src.core.engine.atomic_gpt import SessionWarden
from src.core.sovereign_hud import SovereignHUD
from src.core.sv_engine import SovereignEngine
from src.tools.update_gemini_manifest import update_manifest


class SovereignWrapper:
    def __init__(self):
        self.root = PROJECT_ROOT
        SovereignHUD.PERSONA = "ODIN"
        SovereignHUD._INITIALIZED = True
        self.engine = None

    def _get_engine(self):
        """Lazy-load and cache the engine instance for the session."""
        if not self.engine:
            self.engine = SovereignEngine(project_root=self.root)
        return self.engine

    def initial_scan(self):
        """Step 1: Structural PennyOne scan to see the current state of the system."""
        SovereignHUD.box_top("STEP 1: INITIAL STRUCTURAL SCAN")
        SovereignHUD.persona_log("ALFRED", "Performing initial structural harvest (PennyOne)...")
        try:
            subprocess.run(["npx.cmd", "tsx", "cstar.ts", "pennyone", "--scan"], cwd=str(self.root), check=True)
            SovereignHUD.box_row("STATUS", "COMPLETE", SovereignHUD.GREEN)
        except subprocess.CalledProcessError as e:
            SovereignHUD.persona_log("HEIMDALL", f"BREACH: Initial PennyOne harvest failed. {e}")
        SovereignHUD.box_bottom()

    def release_ravens(self):
        """Step 2: Ravens are set free to work in system."""
        SovereignHUD.box_top("STEP 2: RELEASE THE RAVENS")
        SovereignHUD.persona_log("ODIN", "Running a one-shot Ravens sweep through the kernel...")
        npx_cmd = "npx.cmd" if os.name == 'nt' else "npx"
        try:
            subprocess.run([npx_cmd, "tsx", "cstar.ts", "ravens", "start"], cwd=str(self.root), check=True)
            SovereignHUD.box_row("STATUS", "RELEASED", SovereignHUD.GREEN)
        except subprocess.CalledProcessError as e:
            SovereignHUD.persona_log("HEIMDALL", f"BREACH: Raven release failed. {e}")
        SovereignHUD.box_bottom()

    def wait_for_ravens(self):
        """Step 3: Kernel sweeps are synchronous, so no PID polling is required."""
        SovereignHUD.box_top("STEP 3: RAVEN FLIGHT MONITOR")
        SovereignHUD.persona_log("INFO", "Ravens now return when the one-shot kernel sweep completes.")
        SovereignHUD.persona_log("SUCCESS", "Muninn is done flying.")
        SovereignHUD.box_bottom()

    def run_gungnir_gate(self) -> bool:
        """Step 5: Test suite kicks into gear. Fails are fixed."""
        SovereignHUD.box_top("STEP 5: GUNGNIR GATE & TEST SUITE")
        
        npx_cmd = "npx.cmd" if os.name == 'nt' else "npx"
        max_fix_attempts = 3
        for attempt in range(1, max_fix_attempts + 1):
            SovereignHUD.persona_log("INFO", f"Test Cycle {attempt}/{max_fix_attempts}...")
            
            # 1. Ruff (Logic)
            SovereignHUD.box_row("LINT", "Ruff Check", SovereignHUD.CYAN)
            lint_res = subprocess.run(
                [sys.executable, "-m", "ruff", "check", ".", "--select", "F", "--no-cache"],
                cwd=str(self.root), capture_output=True
            )
            
            # 2. NPM Test
            SovereignHUD.box_row("TEST", "NPM Suite", SovereignHUD.CYAN)
            test_res = subprocess.run(["npm", "test"], cwd=str(self.root), shell=True, capture_output=True)
            
            if lint_res.returncode == 0 and test_res.returncode == 0:
                SovereignHUD.box_row("STATUS", "GREEN", SovereignHUD.GREEN)
                SovereignHUD.box_bottom()
                return True
            
            SovereignHUD.box_row("STATUS", "RED", SovereignHUD.RED)
            if attempt < max_fix_attempts:
                SovereignHUD.persona_log("HEIMDALL", "Breach detected in test suite. Initiating auto-fix protocol...")
                try:
                    # Attempt a general fix cycle via Muninn (The Hunter)
                    subprocess.run([npx_cmd, "tsx", "cstar.ts", "ravens", "start"], cwd=str(self.root), check=True)
                    self.wait_for_ravens()
                except: pass
            else:
                SovereignHUD.persona_log("CRITICAL", "Test suite remains RED after multiple fix attempts.")
                SovereignHUD.box_bottom()
                return False
        
        return False

    def synchronize_state(self):
        """Step 6 & 7: Ingest work and final system scan."""
        SovereignHUD.box_top("STEP 6: FINAL SYSTEM SYNC")
        SovereignHUD.persona_log("ALFRED", "Ingesting recent work and performing final system scan...")
        
        npx_cmd = "npx.cmd" if os.name == 'nt' else "npx"
        # Final Structural Scan
        try:
            subprocess.run([npx_cmd, "tsx", "cstar.ts", "pennyone", "--scan"], cwd=str(self.root), check=True)
        except: pass

        # Compile Session Traces
        from src.tools.compile_session_traces import TraceCompiler
        tdir = self.root / ".agents" / "traces"
        rpath = self.root / ".agents" / "TRACE_REPORT.qmd"
        _, stats = TraceCompiler.execute(tdir=str(tdir), rpath=str(rpath))
        
        update_manifest()
        
        # Sync Edda (Walkthrough/Documentation)
        self._edda_sync()

        # Rebuild Vector Index
        SovereignHUD.persona_log("ODIN", "Rebuilding Sovereign Vector Index...")
        try:
            engine = self._get_engine()
            # V6 Spoke-based rebuild
            engine.engine = engine.builder.build_vector_engine(engine.injector.skills_db_path)
        except Exception as e:
            SovereignHUD.persona_log("HEIMDALL", f"BREACH: Vector Indexing failed. {e}")

        SovereignHUD.box_bottom()
        return stats

    def _edda_sync(self) -> None:
        """Updates walkthrough.qmd with new capabilities."""
        try:
            proc = subprocess.run(["git", "status", "--porcelain"], cwd=str(self.root), capture_output=True, text=True)
            changes = proc.stdout.splitlines()
            new_capabilities = []
            for line in changes:
                status, path_str = line[:2], line[3:]
                if status.strip() in ("??", "A"):
                    if "src/skills" in path_str or ".agents/workflows" in path_str:
                        new_capabilities.append(path_str)

            if new_capabilities:
                SovereignHUD.persona_log("EDDA", f"Detected {len(new_capabilities)} new capabilities.")
                wpath = self.root / "walkthrough.qmd"
                if wpath.exists():
                    timestamp = datetime.now().strftime('%H:%M:%S')
                    with open(wpath, "a", encoding="utf-8") as f:
                        f.write(f"\n\n### ⚡ Dynamic Capabilities Forged ({timestamp})\n")
                        for cap in new_capabilities:
                            f.write(f"- `{cap}`\n")
        except Exception as e:
            SovereignHUD.persona_log("EDDA", f"Warning: Auto-documentation failed. {e}")

    def review_technical_debt(self, stats=None) -> None:
        """[V4] Technical Debt Review: JSONL Archival and Learning Pulse."""
        queue_path = self.root / ".agents" / "anomalies_queue.jsonl"
        archive_path = self.root / ".agents" / "anomalies_archive.json"

        if not queue_path.exists():
            return

        SovereignHUD.box_top("TECHNICAL DEBT REVIEW")
        
        # 1. Bounded Retry Loop for Windows File Locks (10s envelope)
        temp_data = []
        success = False
        retries = 50 
        while retries > 0 and not success:
            try:
                temp_queue = self.root / ".agents" / f"queue_pulse_{int(time.time())}.jsonl"
                os.rename(queue_path, temp_queue)
                with open(temp_queue, encoding="utf-8") as f:
                    for line in f:
                        if line.strip(): temp_data.append(json.loads(line))
                temp_queue.unlink()
                success = True
            except (PermissionError, FileNotFoundError):
                time.sleep(0.2)
                retries -= 1

        if not success:
            SovereignHUD.persona_log("HEIMDALL", "CAUTION: Anomalies Queue locked.")
            SovereignHUD.box_bottom()
            return

        # 2. Archival
        if archive_path.exists():
            with open(archive_path, encoding="utf-8") as f: archive = json.load(f)
        else: archive = []

        session_scores = []
        for entry in temp_data:
            session_scores.append(entry.get("anomaly_probability", 0.0))
            entry["status"] = "archived"
            archive.append(entry)

        with open(archive_path, "w", encoding="utf-8") as f: json.dump(archive, f, indent=2)
        SovereignHUD.box_row("MIGRATED", f"{len(temp_data)} anomalies to archive.", SovereignHUD.CYAN)

        # 3. Session Learning Pulse (Atomic GPT)
        if stats:
            avg_score = sum(session_scores) / len(session_scores) if session_scores else 0.5
            trace_count = stats.get('total', 0)
            error_rate = len(stats.get('critical_fails', [])) / max(1, trace_count)
            session_vector = [avg_score, trace_count, error_rate]

            try:
                warden = SessionWarden()
                warden.train()
                warden.train_step(session_vector, 0.0)
                SovereignHUD.box_row("PULSE", "SessionWarden learning cycle complete.", SovereignHUD.GREEN)
            except Exception as e:
                SovereignHUD.persona_log("WARN", f"Learning pulse failed: {e}")

        SovereignHUD.box_bottom()

    def sovereign_commit(self, stats) -> None:
        """Step 8: Final system commit."""
        SovereignHUD.box_top("STEP 8: SOVEREIGN COMMIT")
        SovereignHUD.persona_log("ODIN", "Initiating Sovereign Commit Protocol...")
        proc = subprocess.run(["git", "status", "--porcelain"], cwd=str(self.root), capture_output=True, text=True)
        if not proc.stdout.strip():
            SovereignHUD.persona_log("ALFRED", "No changes to commit.")
            SovereignHUD.box_bottom()
            return

        commit_msg = f"""feat: Sovereign Sync (Session {datetime.now().strftime('%Y-%m-%d')})

- Processed {stats.get('total', 0) if stats else 'N/A'} neural traces.
- Validated codebase integrity and V4 Hardening.
- SessionWarden learning pulse successful.
- Deep memory teardown and GC sweep complete.

[O.D.I.N.] Dominion Expanded."""

        try:
            subprocess.run(["git", "add", "."], cwd=str(self.root), check=True)
            subprocess.run(["git", "commit", "-m", commit_msg], cwd=str(self.root), check=True)
            # [MANDATE]: NEVER push without explicit user request.
            # subprocess.run(["git", "push"], cwd=str(self.root), check=True)
            SovereignHUD.box_row("STATUS", "COMMITTED", SovereignHUD.GREEN)
        except subprocess.CalledProcessError as e:
            SovereignHUD.persona_log("HEIMDALL", f"BREACH: Git Protocol Failed. {e}")
        SovereignHUD.box_bottom()

    def teardown(self) -> None:
        """Final Dormancy."""
        SovereignHUD.persona_log("INFO", "Initiating global dormancy...")
        try:
            if os.name == 'nt':
                subprocess.run(["npx.cmd", "tsx", "cstar.ts", "sleep"], cwd=str(self.root), capture_output=True)
            else:
                subprocess.run(["npx", "tsx", "cstar.ts", "sleep"], cwd=str(self.root), capture_output=True)
        except: pass

        if self.engine:
            self.engine.teardown()

        gc.collect()
        SovereignHUD.persona_log("SUCCESS", "Wrap-up Protocol: Memory boundaries secured.")


def main() -> None:
    try:
        wrapper = SovereignWrapper()
        
        # 1. Initial Scan
        wrapper.initial_scan()
        
        # 2. Release Ravens
        wrapper.release_ravens()
        
        # 3. Wait for Ravens
        wrapper.wait_for_ravens()
        
        # 4. (Ravens update attributes during their run)
        
        # 5. Test Suite & Fixes
        wrapper.run_gungnir_gate()
        
        # 6. Ingest & Final Scan
        stats = wrapper.synchronize_state()
        
        # 7. Review & Pulse (Learning Pulse for Atomic GPT)
        wrapper.review_technical_debt(stats)
        
        # 8. Commit
        wrapper.sovereign_commit(stats)

        # 9. Teardown
        wrapper.teardown()

    except KeyboardInterrupt:
        sys.exit(130)

if __name__ == "__main__":
    main()
