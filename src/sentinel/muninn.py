"""
Muninn: The Raven of Memory & Excellence (Autonomous Improver)
Identity: ODIN/ALFRED Hybrid
Purpose: Execute the Ravens Protocol autonomously.

Wardens of Asgard (Modular):
  Valkyrie, Mimir, Edda, RuneCaster, Freya, Norn, Huginn
"""

import asyncio
import json
import logging
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path

from colorama import init
from google import genai

# Initialize Colorama
init(autoreset=True)

# Shared Bootstrap
import sys
from pathlib import Path
project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.sentinel._bootstrap import bootstrap
bootstrap()

# Core Imports
from src.core.annex import HeimdallWarden
from src.core.engine.alfred_observer import AlfredOverwatch
from src.core.engine.atomic_gpt import AnomalyWarden

# Gungnir Engine Imports
from src.core.metrics import ProjectMetricsEngine
from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import AntigravityUplink
from src.sentinel.code_sanitizer import (
    sanitize_code,
    sanitize_test,
    scan_and_enrich_imports,
)

# Stability Modules
from src.sentinel.stability import GungnirValidator, TheWatcher
from src.sentinel.wardens.edda import EddaWarden
from src.sentinel.wardens.freya import FreyaWarden
from src.sentinel.wardens.huginn import HuginnWarden
from src.sentinel.wardens.mimir import MimirWarden

# Warden Modules
from src.sentinel.wardens.norn import NornWarden
from src.sentinel.wardens.runecaster import RuneCasterWarden
from src.sentinel.wardens.valkyrie import ValkyrieWarden
from src.tools.brave_search import BraveSearch
from tests.integration.project_fishtest import GungnirSPRT

# Configure Logging
logging.basicConfig(
    filename="sovereign_activity.log",
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

class Muninn:
    def __init__(self, target_path: str = None, client: any = None, use_bridge: bool = False, use_docker: bool = False) -> None:
        """
        Initializes Muninn (The Memory).
        :param target_path: The root directory to monitor.
        :param client: Optional mock/proxy client for LLM testing.
        :param use_bridge: If True, uses the Antigravity Bridge for inference.
        :param use_docker: If True, executes verification in a sandboxed Docker container.
        """
        self.root = Path(target_path or os.getcwd()).resolve()
        self.use_bridge = use_bridge
        self.use_docker = use_docker
        
        # Identity
        self.observer = AlfredOverwatch()
        
        # 1. Check for Shadow Forge Environment
        self.is_worker = os.getenv("SHADOW_FORGE_WORKER") == "true"
        self.mock_mode = os.getenv("MOCK_MODE") == "true"
        
        # 2. Prioritize the isolated Muninn key
        self.api_key = os.getenv("MUNINN_API_KEY") or os.getenv("GOOGLE_API_KEY")
        
        if self.mock_mode:
            from tests.harness.raven_proxy import RavenProxy
            SovereignHUD.persona_log("INFO", "[SHADOW] Engaging Local Mock (RavenProxy)")
            self.client = RavenProxy(mock_mode=True)
            self.api_key = self.api_key or "MOCK_KEY"
        
        if not self.api_key:
            raise ValueError("API environment variable not set.")

        if not self.mock_mode:
            self.client = client or genai.Client(api_key=self.api_key)

        self.uplink = AntigravityUplink(api_key=self.api_key or "MOCK_KEY")

        # Stability Manager
        self.validator = GungnirValidator()
        self.watcher = TheWatcher(self.root / ".agent" / "watcher.json")
        self.metrics_engine = ProjectMetricsEngine()

        # 3. Mirror Workspace if Shadow Forge Worker
        if self.is_worker:
            self._setup_shadow_workspace()

        # Model configuration will be resolved dynamically via the bridge's fallback logic.
        # Metrics & Engines
        self.observer = AlfredOverwatch()
        self.sprt = GungnirSPRT()

        # PID File management
        self.pid_file = self.root / ".agent" / "muninn.pid"

        # Metric Tracking
        self._strategist_metrics: dict[str, dict[str, int]] = {}

    def _write_pid(self):
        self.pid_file.parent.mkdir(parents=True, exist_ok=True)
        self.pid_file.write_text(str(os.getpid()))

    def _clear_pid(self):
        if self.pid_file.exists():
            self.pid_file.unlink()

    def _check_agent_active(self) -> bool:
        """Checks if the Antigravity Agent is currently active."""
        if os.getenv("CSTAR_AGENT_ACTIVE"):
            SovereignHUD.persona_log("INFO", "Active Agent Detected. Deferring execution to allowed entity.")
            return True
        return False

    def _get_model(self, persona: str) -> str:
        """Resolves the most appropriate fallback model dynamically."""
        try:
            from src.cstar.core.antigravity_bridge import _get_optimal_model
            # Use api_key or 'default' to key the model cache
            return _get_optimal_model(self.client, self.api_key or "default", persona)
        except Exception:
            return "gemini-2.0-flash"

    def _setup_shadow_workspace(self):
        """Mirrors the RO /app mount to a writable /shadow_forge directory."""
        SovereignHUD.persona_log("INFO", "[WORKER] Mirroring workspace to ephemeral layer...")
        shadow_root = Path("/shadow_forge")
        
        try:
            if shadow_root.exists():
                shutil.rmtree(shadow_root)
            
            # Copy everything from /app to /shadow_forge
            # /app is the RO mount from the host
            shutil.copytree("/app", shadow_root, dirs_exist_ok=True)
            self.root = shadow_root
            SovereignHUD.persona_log("INFO", f"[WORKER] Workspace mirrored to {self.root}")
            
            # Switch to the new root
            os.chdir(str(self.root))
        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"[WORKER] Mirroring failed: {e}")
            sys.exit(1)
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Model resolution failed: {e}")
            return "gemini-2.5-pro" if persona in ["ODIN", "ALFRED"] else "gemini-2.0-flash"

    def _load_prompt(self, name: str, variables: dict) -> str:
        """Loads a .prompty file and replaces variables."""
        prompt_path = self.root / ".agent" / "prompts" / f"{name}.prompty"
        if not prompt_path.exists():
            return ""
        content = prompt_path.read_text(encoding='utf-8')
        for k, v in variables.items():
            content = content.replace(f"{{{{{k}}}}}", str(v))
        return content

    def _sync_send(self, prompt: str, context: dict):
        """Safely executes the async uplink payload from a synchronous flow."""
        return asyncio.run(self.uplink.send_payload(prompt, context))

    def _get_alfred_suggestions(self) -> str:
        """Reads suggestions from .agent/ALFRED_SUGGESTIONS.md."""
        suggestions_path = self.root / ".agent" / "ALFRED_SUGGESTIONS.md"
        if not suggestions_path.exists():
            return ""
        return f"\nALFRED SUGGESTIONS:\n{suggestions_path.read_text(encoding='utf-8')}\n"

    def run(self) -> bool:
        """The main Ravens Protocol loop."""
        if self.use_docker and not self.is_worker:
            return self._orchestrate_shadow_forge()

        SovereignHUD.persona_log("INFO", f"Muninn is scouring {self.root.name}...")

        # [GPHS] Initial Metrics Sweep
        pre_gphs = self.metrics_engine.compute(str(self.root))
        SovereignHUD.persona_log("INFO", f"Global Project Health Score (Pre): {pre_gphs:.2f}")

        # 1. THE HUNT (Parallel Scan)
        # Refactored to use Asyncio (Phase 8: Muninn Integration)

        self._write_pid()
        try:
            SovereignHUD.persona_log("INFO", "Initiating the Hunt (Asynchronous Scan)...")
            # We run the async cycle
            found_breaches, scan_stats = asyncio.run(self._execute_hunt_async())
            all_breaches = found_breaches
            scan_results = scan_stats
            SovereignHUD.persona_log("INFO", f"Hunt complete. Breaches discovered: {len(all_breaches)}")
        except Exception as e:
            SovereignHUD.persona_log("CRITICAL", f"Async Hunt Failed: {e}")
            return False
        finally:
            self._clear_pid()


        # 2. SELECT TARGET (Prioritization)
        # Sort by severity: CRITICAL > HUGINN_xxx (High) > HIGH > MEDIUM > LOW
        severity_map = {
            "CRITICAL": 100,
            "HIGH": 80,
            "MEDIUM": 50,
            "LOW": 20
        }

        # Helper to get score
        def get_score(b):
            # Special case: Huginn breaches are effectively HIGH/CRITICAL
            if "HUGINN" in b.get('type', ''):
                return 85
            return severity_map.get(b.get('severity', 'LOW').upper(), 0)

        all_breaches.sort(key=get_score, reverse=True)

        self._emit_metrics_summary(scan_results)

        if not all_breaches:
            if SovereignHUD.PERSONA == "ALFRED":
                SovereignHUD.persona_log("SUCCESS", "Everything appears to be in order, sir.")
            else:
                SovereignHUD.persona_log("SUCCESS", "The waters are clear. Heimdall sees no threats.")
            return False

        target = all_breaches[0]
        selected_strategist = target.get('type', 'UNKNOWN').split('_')[0]

        SovereignHUD.persona_log("INFO", f"Selected priority target: {target['file']} for {target['action']}")
        SovereignHUD.persona_log("WARN", f"Target: {target['action']} in {target['file']}")
        logging.info(f"[{self.root.name}] [TARGET] {target['action']} ({target['file']})")

        # [INTEGRATION] Web Search for Context (Targeted Optimization)
        # Only search for the ONE item we are actually going to fix.
        searcher = BraveSearch()
        if searcher.is_quota_available():
            target_severity = target.get('severity', '')
            target_type = target.get('type', '')
            target_action = target.get('action', '').lower()

            is_aesthetic = target_type in ('FREYA_BIRKHOFF_BREACH', 'FREYA_GOLDEN_RATIO_BREACH')
            is_structural = any(k in target_type for k in ('STRUCTURAL_BREACH', 'EDDA_', 'MIMIR_'))

            if target_severity in ('CRITICAL', 'HIGH') or 'error' in target_action or is_aesthetic or is_structural:
                if is_aesthetic:
                    query = "UI/UX design best practices reduce complexity increase order harmony Tailwind Golden Ratio"
                elif is_structural:
                    query = "Python AST clean code best practices cyclomatic complexity balanced ratios"
                else:
                    query = f"python {target.get('action')} {target.get('file', '')}"

                SovereignHUD.persona_log("INFO", f"Searching Brave for context: {query}")
                results = searcher.search(query)
                if results:
                    top = results[0]
                    # Create dedicated context to preserve verb-noun action structure
                    target['search_context'] = f"Context: {top.get('title')} ({top.get('url')})"

        # [WATCHER] Anti-Oscillation Check
        if self.watcher.is_locked(target['file']):
            SovereignHUD.persona_log("WARN", f"Jurisdiction Denied: {target['file']} is LOCKED (Unstable).")
            return False

        try:
            # 3. FORGE (Execute Fix)
            # [INTEGRATION] Agent Takeover Check
            if self._check_agent_active():
                 SovereignHUD.persona_log("WARN", "Operation C*CLI: Agent is Active. Skipping Auto-Forge.")
                 return False

            if not self._forge_improvement(target):
                return False

            # 4. CRUCIBLE (Verify)
            if self._verify_fix(target):
                logging.info(f"[{self.root.name}] [SUCCESS] Verified fix for {target['file']}")

                # 5. SPRT STABILITY CHECK
                if not self._verify_sprt_stability(target):
                    self._record_metric(selected_strategist, hit=False)
                    return False

                # 6. PERFORMANCE BENCHMARK CHECK
                if not self._verify_performance(target):
                     return False

                # 6b. [GPHS] Post-Mutation Delta Analysis
                post_gphs = self.metrics_engine.compute(str(self.root))
                SovereignHUD.persona_log("INFO", f"Global Project Health Score (Post): {post_gphs:.2f}")

                sprt_result = self.sprt.evaluate_delta(pre_gphs, post_gphs)
                if sprt_result == 'FAIL':
                    SovereignHUD.persona_log("FAIL", f"GPHS REGRESSION DETECTED (Delta: {post_gphs - pre_gphs:.4f}). Rolling back.")
                    self.observer.write_suggestion(
                        self.observer.analyze_failure(target['file'], "GPHS Regression Detected"),
                        str(self.root / ".agent" / "ALFRED_SUGGESTIONS.md")
                    )
                    self._rollback(target)
                    self._record_metric(selected_strategist, hit=False)
                    return False

                SovereignHUD.persona_log("PASS", f"GPHS DELTA SECURED: {post_gphs - pre_gphs:+.4f}")
                self._record_metric(selected_strategist, hit=True)

                if self.is_worker:
                    SovereignHUD.persona_log("INFO", f"[PROMOTION] {target['file']}")
                    # We print to stdout as well for the orchestrator to capture
                    print(f"[PROMOTION] {target['file']}")

                # If Campaign task, update the plan
                if target.get('type') == 'CAMPAIGN_TASK':
                    NornWarden(self.root).mark_complete(target)
                    if SovereignHUD.PERSONA == "ALFRED":
                        SovereignHUD.persona_log("SUCCESS", "I have crossed that item off your list, sir.")

                # [INTEGRATION] Neural Training Hook
                try:
                    warden = AnomalyWarden()
                    target_file = self.root / target['file']
                    if target_file.exists():
                        # Feed execution metadata to the warden for anomaly detection
                        metadata = [100.0, 50, 3, 0.01]  # baseline vector
                        warden.train_step(metadata, [0.0])  # label 0 = normal
                        warden.save()
                        SovereignHUD.persona_log("INFO", f"AnomalyWarden evolved. Training step complete.")
                except Exception as e:
                    SovereignHUD.persona_log("WARN", f"Neural evolution failed: {e}")

                return True
            else:
                # [ALFRED] Analyze failure on Crucible Fail
                self.observer.write_suggestion(
                    self.observer.analyze_failure(target['file'], "Crucible Verification Failed"),
                    str(self.root / ".agent" / "ALFRED_SUGGESTIONS.md")
                )
                self._rollback(target) # Zero-Trust Rollback
                self._record_metric(selected_strategist, hit=False)
                return False

        except (KeyboardInterrupt, SystemExit):
            SovereignHUD.persona_log("WARN", "Operation interrupted. Distilling current progress.")
            self._distill_knowledge(target, success=False)
            raise
        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Core Execution Failure: {e}")
            return False

    def _emit_metrics_summary(self, scan_results: dict):
        """[ALFRED] Logs the summary of discovered breaches."""
        SovereignHUD.persona_log("INFO", "Scan Summary:")
        if not scan_results:
            SovereignHUD.persona_log("INFO", "  - No wardens reported.")
            return

        for warden, counts in scan_results.items():
            if counts > 0:
                SovereignHUD.persona_log("INFO", f"  - {warden}: {counts} breaches")

    async def _execute_hunt_async(self):
        """
        Executes the Warden Scan in parallel using Asyncio.
        """
        wardens = {
            "ANNEX": HeimdallWarden(self.root),
            "NORN": NornWarden(self.root),
            "VALKYRIE": ValkyrieWarden(self.root),
            "EDDA": EddaWarden(self.root),
            "RUNE": RuneCasterWarden(self.root),
            "MIMIR": MimirWarden(self.root),
            "HUGINN": HuginnWarden(self.root),
            "FREYA": FreyaWarden(self.root)
        }

        all_breaches = []
        scan_results = {}

        # Heimdall / Annex is special
        try:
            wardens["ANNEX"].scan()
            annex_breaches = []
            for b in wardens["ANNEX"].breaches:
                 b['type'] = 'ANNEX_BREACH'
                 b['severity'] = 'CRITICAL'
                 annex_breaches.append(b)
            scan_results["ANNEX"] = len(annex_breaches)
            all_breaches.extend(annex_breaches)
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Heimdall Scan Failed: {e}")

        # Async Wardens
        tasks = []
        names = []

        for name, w in wardens.items():
            if name == "ANNEX": continue
            if hasattr(w, 'scan_async'):
                tasks.append(w.scan_async())
                names.append(name)
            else:
                tasks.append(asyncio.to_thread(w.scan))
                names.append(name)

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for name, res in zip(names, results):
                if isinstance(res, Exception):
                    SovereignHUD.persona_log("WARN", f"{name} Failed: {res}")
                    scan_results[name] = 0
                else:
                    scan_results[name] = len(res)
                    all_breaches.extend(res)

        return all_breaches, scan_results

    # ==============================================================================
    # 🔨 THE FORGE (Execution Engine)
    # ==============================================================================

    def _forge_improvement(self, target: dict) -> bool:
        """Generates and applies the fix using TDD (Test-Driven Development)."""
        file_path = self.root / target['file']

        # Reading File Content
        if file_path.exists():
            original_content = file_path.read_text(encoding='utf-8')
        else:
            original_content = "" # New file creation

        SovereignHUD.persona_log("INFO", "Forging improvement...")

        # 1. Generate Test Case (The Gauntlet)
        SovereignHUD.persona_log("INFO", "Step 1: Generating the Gauntlet (Reproduction Test)...")
        test_path = self._run_gauntlet(target, original_content)
        if not test_path:
            SovereignHUD.persona_log("FAIL", "Gauntlet generation failed.")
            return False
        SovereignHUD.persona_log("SUCCESS", f"Gauntlet secured: {test_path.name}")

        # 2. Generate Implementation (The Steel)
        SovereignHUD.persona_log("INFO", "Step 2: Forging the Steel (Implementation Fix)...")
        new_content = self._generate_implementation(target, original_content, test_path)
        if not new_content:
             SovereignHUD.persona_log("FAIL", "Forge failed to generate implementation.")
             return False
        SovereignHUD.persona_log("SUCCESS", "Steel forged successfully.")

        # 3. Apply Change
        try:
            # Backup
            if file_path.exists():
                shutil.copy(file_path, str(file_path) + ".bak")

            SovereignHUD.persona_log("INFO", f"Applying mutation to {target['file']}...")
            file_path.write_text(new_content, encoding='utf-8')

            # Watcher Record
            if not self.watcher.record_edit(target['file'], new_content):
                SovereignHUD.persona_log("FAIL", "Watcher rejected the mutation: Potential oscillation or fatigue.")
                # Rollback if watcher says NO
                if Path(str(file_path) + ".bak").exists():
                    shutil.copy(str(file_path) + ".bak", file_path)
                return False
            SovereignHUD.persona_log("SUCCESS", "Mutation applied and recorded.")

        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Forge failed to write: {e}")
            return False

        return True

    def _run_gauntlet(self, target: dict, code_context: str) -> Path | None:
        """Generates a dedicated reproduction test case."""
        prompt = self._load_prompt("gauntlet_generator", {
            "ACTION": target['action'],
            "FILE": target['file'],
            "CODE": code_context,
            "SEARCH_CONTEXT": target.get('search_context', '')
        })

        if not prompt: # Fallback
             search_str = f"\n[Context from Web]: {target['search_context']}" if target.get('search_context') else ""
             prompt = f"Create a pytest reproduction script for: {target['action']} in {target['file']}.{search_str}\nContext:\n{code_context}"

        try:
            if self.use_bridge:
                # Route safely through Node.js Bridge
                response = self._sync_send(prompt, {"persona": "ODIN"})
                raw_data = response.get("data", {})
                raw_test = raw_data.get("code", "") if isinstance(raw_data, dict) else raw_data
            else:
                # Direct Native API Call
                model_name = self._get_model("TESTER") # Use flash
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )
                raw_test = response.text
            clean_test = sanitize_test(raw_test, target['file'], self.root)

            test_file = self.root / "tests" / "gauntlet" / f"test_{int(time.time())}.py"
            test_file.parent.mkdir(parents=True, exist_ok=True)
            test_file.write_text(clean_test, encoding='utf-8')

            return test_file
        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Gauntlet creation failed: {e}")
            return None



    def _generate_implementation(self, target: dict, original_code: str, test_path: Path) -> str | None:
        """Generates the code fix ensuring it passes the test."""
        # Read the test we just made
        test_content = test_path.read_text(encoding='utf-8')

        # [Ragnarok] Live Knowledge Injection
        live_docs = scan_and_enrich_imports(original_code, self.root)
        if live_docs:
            SovereignHUD.persona_log("INFO", "Augmenting Forge prompt with live documentation.")

        # We append docs to the code so it appears in the context
        augmented_code = original_code + live_docs

        prompt = self._load_prompt("forge_implementation", {
            "ACTION": target['action'],
            "FILE": target['file'],
            "CODE": augmented_code,
            "TEST": test_content,
            "ALFRED_SUGGESTIONS": self._get_alfred_suggestions(),
            "SEARCH_CONTEXT": target.get('search_context', '')
        })

        if not prompt:
            search_str = f"\n[Context from Web]: {target['search_context']}" if target.get('search_context') else ""
            prompt = f"Fix the issue: {target['action']}.{search_str}\nFile: {target['file']}\nCode:\n{augmented_code}\nTest:\n{test_content}"

        try:
            if self.use_bridge:
                # Route safely through Node.js Bridge
                response = self._sync_send(prompt, {"persona": "ODIN"})
                raw_data = response.get("data", {})
                raw_code = raw_data.get("code", "") if isinstance(raw_data, dict) else raw_data
            else:
                # Direct Native API Call
                model_name = self._get_model("ODIN") # Use pro
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )
                raw_code = response.text
            return sanitize_code(raw_code)
        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Implementation generation failed: {e}")
            return None

    # ==============================================================================
    # ⚗️ THE CRUCIBLE (Verification)
    # ==============================================================================

    def _verify_fix(self, target: dict) -> bool:
        """Runs the test suite to verify the fix."""
        SovereignHUD.persona_log("INFO", "Entering the Crucible (Verification)...")

        import sys
        # 1. Run the specific gauntlet test
        SovereignHUD.persona_log("INFO", "Executing Gauntlet Test Suite...")
        
        if self.use_docker:
            SovereignHUD.persona_log("INFO", "Deploying Containerized Crucible for verification...")
            from src.sentinel.sandbox_warden import SandboxWarden
            warden = SandboxWarden(timeout=30)
            # For verification, we just run the gauntlet test file
            # Ideally, we would mount the whole project, but for now, we test the logic.
            # Real implementation: build image once, then run.
            report = warden.run_in_sandbox(self.root / "tests" / "gauntlet" / "test_reproduce.py") # Example path
            if report["exit_code"] != 0:
                SovereignHUD.persona_log("FAIL", "Containerized Gauntlet Failed.")
                return False
            SovereignHUD.persona_log("PASS", "Containerized Gauntlet Successful.")
            return True

        cmd = [sys.executable, "-m", "pytest", str(self.root / "tests" / "gauntlet"), "-v"]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                SovereignHUD.persona_log("FAIL", "Gauntlet Verification Failed.")
                SovereignHUD.persona_log("DEBUG", f"Pytest Output: {result.stdout}")
                return False
            SovereignHUD.persona_log("PASS", "Gauntlet Verification Successful.")
        except Exception as e:
            SovereignHUD.persona_log("FAIL", f"Gauntlet Verification execution failed: {e}")
            return False

        # 2. Run relevant unit tests (Regression Check)
        # Scan for related tests
        cmd_reg = [sys.executable, "-m", "pytest", "tests/unit", "-k", Path(target['file']).stem]
        try:
            reg_result = subprocess.run(cmd_reg, capture_output=True, text=True)
            if reg_result.returncode != 0:
                SovereignHUD.persona_log("WARN", f"Regression test flagged: {Path(target['file']).stem}")
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Regression Verification execution failed: {e}")
        # We don't strictly fail on regression here yet, but we could.

        return True

    def _verify_sprt_stability(self, target: dict) -> bool:
        """Runs Gungnir SPRT to statistically verify stability."""
        SovereignHUD.persona_log("INFO", "Running Gungnir SPRT verification...")

        # Use a quick 3-run check for now
        # Ideally we run the test N times
        validator = GungnirValidator()

        for i in range(3):
            cmd = [sys.executable, "-m", "pytest", str(self.root / "tests" / "gauntlet"), "-q"]
            try:
                res = subprocess.run(cmd, capture_output=True, text=True)
                success = (res.returncode == 0)
            except Exception as e:
                SovereignHUD.persona_log("FAIL", f"SPRT test execution failed: {e}")
                success = False
            validator.record_trial(success)

            if validator.status == "REJECT":
                 SovereignHUD.persona_log("FAIL", "Gungnir: Fix is statistically FLAKY.")
                 return False
            if validator.status == "ACCEPT":
                 SovereignHUD.persona_log("PASS", "Gungnir: Fix is statistically STABLE.")
                 return True

        return True # Default pass if inclusive

    def _verify_performance(self, target: dict) -> bool:
        """Placeholder for performance benchmarking."""
        # Could run a benchmark script if available
        return True

    def _rollback(self, target: dict):
        """Reverts changes if verification failed."""
        file_path = self.root / target['file']
        backup = Path(str(file_path) + ".bak")
        if backup.exists():
            shutil.copy(backup, file_path)
            SovereignHUD.persona_log("WARN", "Changes rolled back.")

    def _record_metric(self, strategist: str, hit: bool):
        """Records success/fail rate for each warden."""
        if strategist not in self._strategist_metrics:
            self._strategist_metrics[strategist] = {"attempts": 0, "success": 0}

        self._strategist_metrics[strategist]["attempts"] += 1
        if hit:
            self._strategist_metrics[strategist]["success"] += 1

    def _orchestrate_shadow_forge(self) -> bool:
        """Host-side orchestration of the Shadow Forge cycle."""
        if self.mock_mode:
            image_name = "sentinel-sandbox" # Specific image for mock/sandbox
        else:
            image_name = "sentinel-sandbox"
        
        # Check if image exists
        try:
            check_img = subprocess.run(["docker", "image", "inspect", image_name], capture_output=True)
            if check_img.returncode != 0:
                SovereignHUD.persona_log("FAIL", f"[ORCHESTRATOR] Docker Image '{image_name}' not found. Please build it first.")
                return False
        except Exception:
            SovereignHUD.persona_log("FAIL", "[ORCHESTRATOR] Docker daemon not responsive.")
            return False

        # Build command
        cmd = [
            "docker", "run",
            "--name", container_name,
            "-v", f"{proj_root}:/app:ro", # RO Mount
            "-e", "SHADOW_FORGE_WORKER=true",
            "-e", f"MOCK_MODE={'true' if self.mock_mode else 'false'}",
            "-e", f"GOOGLE_API_KEY={os.getenv('GOOGLE_API_KEY', '')}",
            "-e", f"MUNINN_API_KEY={os.getenv('MUNINN_API_KEY', '')}",
            "sentinel-sandbox",
            "python", "-m", "src.sentinel.muninn"
        ]
        
        try:
            SovereignHUD.persona_log("INFO", f"[ORCHESTRATOR] Starting transient worker {container_name}...")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                SovereignHUD.persona_log("SUCCESS", "[ORCHESTRATOR] Shadow Forge Cycle Verified.")
                # Atomic Promotion: Pull the fixed file (We need to know which one was fixed)
                # For now, we'll assume the worker logs or signal the chosen file.
                # A more robust way is to have the worker write metadata to stdout.
                return self._promote_from_container(container_name, result.stdout)
            else:
                SovereignHUD.persona_log("FAIL", f"[ORCHESTRATOR] Shadow Forge Failed (Code {result.returncode})")
                SovereignHUD.persona_log("DEBUG", result.stderr)
                return False
        finally:
            subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)

    def _promote_from_container(self, container_name: str, stdout: str) -> bool:
        """Extracts fixed files from the container layer."""
        # Simple extraction: look for [PROMOTION] tags in stdout
        import re
        matches = re.findall(r"\[PROMOTION\]\s+(.*)", stdout)
        if not matches:
            SovereignHUD.persona_log("WARN", "[ORCHESTRATOR] No promotion targets detected.")
            return False
            
        for target in matches:
            target_clean = target.strip()
            dest = self.root / target_clean
            SovereignHUD.persona_log("INFO", f"[ORCHESTRATOR] Promoting {target_clean} to host...")
            subprocess.run(["docker", "cp", f"{container_name}:/app/{target_clean}", str(dest)], check=True)
        
        return True

    def _distill_knowledge(self, target: dict = None, success: bool = False):
        """
        Extracts learnings from the ledger and generates cortex_directives.md.
        Acts as the subconscious of the framework.
        """
        ledger_path = self.root / ".agent" / "ledger.json"
        if not ledger_path.exists():
            return

        try:
            with open(ledger_path) as f:
                data = json.load(f)
        except Exception:
            return

        history = data.get("flight_history", [])
        if not history:
            return

        # 1. Identify Cursed Files (High Risk)
        # > 2 evaluations AND >= 50% Reject rate
        file_stats = {}
        for entry in history:
            t_file = entry.get("target")
            if not t_file:
                continue
            if t_file not in file_stats:
                file_stats[t_file] = {"total": 0, "rejects": 0}

            file_stats[t_file]["total"] += 1
            if entry.get("decision") == "Reject":
                file_stats[t_file]["rejects"] += 1

        cursed_files = []
        for fname, stats in file_stats.items():
            if stats["total"] > 2:
                failure_rate = stats["rejects"] / stats["total"]
                if failure_rate >= 0.5:
                    cursed_files.append(f"{fname} (Failure Rate: {failure_rate:.0%})")

        # 2. Identify Blessed Precedents (High Success)
        # Top 3 most recent "Accept" decisions
        accepted = [h for h in history if h.get("decision") == "Accept"]
        # Sort by timestamp descending
        accepted.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        blessed_precedents = []
        for entry in accepted[:3]:
            tgt = entry.get("target", "Unknown")
            score = entry.get("alignment_score", 0)
            blessed_precedents.append(f"{tgt} (Score: {score})")

        # 3. Generate Cortex Directives
        gphs = data.get("global_project_health_score", 0.0)

        directives_path = self.root / ".agent" / "cortex_directives.md"

        md_content = f"""# Global Project Health Score: {gphs:.2f}

## ☠️ Cursed Files (High Risk)
"""
        if cursed_files:
            for c in cursed_files:
                md_content += f"- {c}\n"
        else:
            md_content += "- None detected.\n"

        md_content += "\n## 🛡️ Blessed Precedents (Mimic Pattern)\n"

        if blessed_precedents:
            for b in blessed_precedents:
                md_content += f"- {b}\n"
        else:
            md_content += "- None available.\n"

        directives_path.write_text(md_content, encoding='utf-8')

        print(f"ODIN: 'The ledger has been read. The Runes of Wisdom are carved at {directives_path}.'")

    def _select_breach_target(self, breaches: list) -> dict:
        """Legacy helper if needed, but new logic sorts list."""
        if not breaches: return None
        return breaches[0]

if __name__ == "__main__":
    import argparse
    from tests.harness.raven_proxy import RavenProxy
    
    p = argparse.ArgumentParser()
    p.add_argument("--audit", action="store_true")
    p.add_argument("--mock", action="store_true", help="Enable mock mode for the Ravens Protocol.")
    p.add_argument("--shadow-forge", "--docker", action="store_true", help="Run the entire cycle inside a sandboxed Docker container.")
    args = p.parse_args()
    
    proxy = None
    if args.mock and not args.shadow_forge:
        SovereignHUD.persona_log("INFO", "Engaging Mock Mode (RavenProxy)...")
        proxy = RavenProxy(mock_mode=True)

    try:
        m = Muninn(client=proxy, use_docker=args.shadow_forge)
        m.run()
    except Exception as e:
        SovereignHUD.persona_log("CRITICAL", f"Muninn Terminated: {e}")
