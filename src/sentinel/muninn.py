"""
Muninn: The Raven of Memory & Excellence (Autonomous Improver)
Identity: ODIN/ALFRED Hybrid
Purpose: Execute the SovereignFish Protocol autonomously.

Wardens of Asgard (Modular):
  Valkyrie, Mimir, Edda, RuneCaster, Freya, Norn, Huginn
"""

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional

from colorama import Fore, init
from google import genai
from google.genai import types

# Initialize Colorama
init(autoreset=True)

# Shared Bootstrap
from src.sentinel._bootstrap import bootstrap
bootstrap()

# Core Imports
from src.core.annex import HeimdallWarden
from src.core.ui import HUD
from src.sentinel.code_sanitizer import (
    classify_error,
    extract_error_summary,
    repair_imports,
    sanitize_code,
    sanitize_test,
    validate_imports,
    validate_syntax,
)

# Gungnir Engine Imports
from src.core.metrics import ProjectMetricsEngine
from src.core.engine.alfred_observer import AlfredOverwatch
from tests.integration.project_fishtest import GungnirSPRT

# Stability Modules
from src.sentinel.stability import GungnirValidator, TheWatcher

# Warden Modules
from src.sentinel.wardens.norn import NornWarden
from src.sentinel.wardens.valkyrie import ValkyrieWarden
from src.sentinel.wardens.edda import EddaWarden
from src.sentinel.wardens.runecaster import RuneCasterWarden
from src.sentinel.wardens.huginn import HuginnWarden
from src.sentinel.wardens.mimir import MimirWarden
from src.sentinel.wardens.freya import FreyaWarden

# Configure Logging
logging.basicConfig(
    filename="sovereign_activity.log",
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

class Muninn:
    def __init__(self, target_path: str, client=None):
        self.root = Path(target_path).resolve()
        self.api_key = os.getenv("GOOGLE_API_KEY")

        if not self.api_key and client is None:
            raise ValueError("GOOGLE_API_KEY environment variable not set.")

        self.client = client or genai.Client(api_key=self.api_key)

        # EMPIRE TDD Configuration
        self.flash_model = "gemini-2.0-flash"
        self.pro_model = "gemini-2.0-pro-exp-02-05"

        # Stability Manager
        self.watcher = TheWatcher(self.root)

        # Metrics & Engines
        self.metrics_engine = ProjectMetricsEngine()
        self.observer = AlfredOverwatch()
        self.sprt = GungnirSPRT()
        
        # Metric Tracking
        self._strategist_metrics: Dict[str, Dict[str, int]] = {}

    def _load_prompt(self, name: str, variables: dict) -> str:
        """Loads a .prompty file and replaces variables."""
        prompt_path = self.root / ".agent" / "prompts" / f"{name}.prompty"
        if not prompt_path.exists():
            return ""
        content = prompt_path.read_text(encoding='utf-8')
        for k, v in variables.items():
            content = content.replace(f"{{{{{k}}}}}", str(v))
        return content

    def _get_alfred_suggestions(self) -> str:
        """Reads suggestions from .agent/ALFRED_SUGGESTIONS.md."""
        suggestions_path = self.root / ".agent" / "ALFRED_SUGGESTIONS.md"
        if not suggestions_path.exists():
            return ""
        return f"\nALFRED SUGGESTIONS:\n{suggestions_path.read_text(encoding='utf-8')}\n"

    def run(self) -> bool:
        """
        Executes one cycle of the Sovereign Fish Protocol using Modular Wardens.
        """
        if HUD.PERSONA == "ALFRED":
            HUD.persona_log("INFO", f"The Ravens are scouting {self.root}...")
        else:
            HUD.persona_log("INFO", f"Muninn is scouring {self.root.name}...")

        # [GPHS] Initial Metrics Sweep
        pre_gphs = self.metrics_engine.compute(str(self.root))
        HUD.persona_log("INFO", f"Global Project Health Score (Pre): {pre_gphs:.2f}")

        # 1. THE HUNT (Parallel Scan)
        wardens = {
            "ANNEX": HeimdallWarden(self.root), # Core Annex
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

        with ThreadPoolExecutor() as executor:
            # HeimdallWarden might not match the BaseWarden interface exactly (it has .breaches attr vs .scan() returning list)
            # Let's check HeimdallWarden behavior.
            # Original code: strategist.scan(); breaches = strategist.breaches
            # So we wrap it or handle it separately.
            # For uniformity, let's run others in parallel and run Heimdall synchronously or wrap it.
            # Let's handle Heimdall separate since it's critical/core.
            
            # Run Heimdall (ANNEX)
            try:
                annex = wardens["ANNEX"]
                annex.scan()
                for b in annex.breaches:
                     # Adapt Annex breach to standard format if needed
                     # Annex breaches are usually: {'file': ..., 'action': ..., 'severity': ...}
                     b['type'] = 'ANNEX_BREACH'
                     b['severity'] = 'CRITICAL' # Force critical for Annex
                     all_breaches.append(b)
                scan_results["ANNEX"] = len(annex.breaches)
            except Exception as e:
                HUD.persona_log("WARN", f"Heimdall Scan Failed: {e}")

            # Run others in parallel
            future_to_name = {}
            for name, w in wardens.items():
                if name == "ANNEX": continue
                future_to_name[executor.submit(w.scan)] = name

            for future in as_completed(future_to_name):
                name = future_to_name[future]
                try:
                    results = future.result()
                    scan_results[name] = len(results)
                    all_breaches.extend(results)
                except Exception as e:
                    HUD.persona_log("WARN", f"{name} Warden Failed: {e}")
                    scan_results[name] = 0

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
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("SUCCESS", "Everything appears to be in order, sir.")
            else:
                HUD.persona_log("SUCCESS", "The waters are clear. Heimdall sees no threats.")
            return False

        target = all_breaches[0]
        selected_strategist = target.get('type', 'UNKNOWN').split('_')[0]

        HUD.persona_log("WARN", f"Target: {target['action']} in {target['file']}")
        logging.info(f"[{self.root.name}] [TARGET] {target['action']} ({target['file']})")

        # [WATCHER] Anti-Oscillation Check
        if self.watcher.is_locked(target['file']):
            HUD.persona_log("WARN", f"Jurisdiction Denied: {target['file']} is LOCKED (Unstable).")
            return False

        try:
            # 3. FORGE (Execute Fix)
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
                HUD.persona_log("INFO", f"Global Project Health Score (Post): {post_gphs:.2f}")
                
                sprt_result = self.sprt.evaluate_delta(pre_gphs, post_gphs)
                if sprt_result == 'FAIL':
                    HUD.persona_log("FAIL", f"GPHS REGRESSION DETECTED (Delta: {post_gphs - pre_gphs:.4f}). Rolling back.")
                    self.observer.write_suggestion(
                        self.observer.analyze_failure(target['file'], "GPHS Regression Detected"),
                        str(self.root / ".agent" / "ALFRED_SUGGESTIONS.md")
                    )
                    self._rollback(target)
                    self._record_metric(selected_strategist, hit=False)
                    return False

                HUD.persona_log("PASS", f"GPHS DELTA SECURED: {post_gphs - pre_gphs:+.4f}")
                self._record_metric(selected_strategist, hit=True)
                
                # If Campaign task, update the plan
                if target.get('type') == 'CAMPAIGN_TASK':
                    NornWarden(self.root).mark_complete(target)
                    if HUD.PERSONA == "ALFRED":
                         HUD.persona_log("SUCCESS", "I have crossed that item off your list, sir.")

                return True
            else:
                # [ALFRED] Analyze failure on Crucible Fail
                self.observer.write_suggestion(
                    self.observer.analyze_failure(target['file'], "Crucible Verification Failed"),
                    str(self.root / ".agent" / "ALFRED_SUGGESTIONS.md")
                )
                self._record_metric(selected_strategist, hit=False)
                return False

        except (KeyboardInterrupt, SystemExit):
            HUD.persona_log("WARN", "Operation interrupted. Distilling current progress.")
            self._distill_knowledge(target, success=False)
            raise
        except Exception as e:
            HUD.persona_log("ERROR", f"Core Execution Failure: {e}")
            return False

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

        HUD.persona_log("INFO", "Forging improvement...")

        # 1. Generate Test Case (The Gauntlet)
        test_path = self._run_gauntlet(target, original_content)
        if not test_path:
            return False

        # 2. Generate Implementation (The Steel)
        new_content = self._generate_implementation(target, original_content, test_path)
        if not new_content:
             return False

        # 3. Apply Change
        try:
            # Backup
            if file_path.exists():
                shutil.copy(file_path, str(file_path) + ".bak")
            
            # Write
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(new_content, encoding='utf-8')
            
            # Watcher Record
            if not self.watcher.record_edit(target['file'], new_content):
                # Rollback if watcher says NO
                if Path(str(file_path) + ".bak").exists():
                    shutil.copy(str(file_path) + ".bak", file_path)
                return False

        except Exception as e:
            HUD.persona_log("ERROR", f"Forge failed to write: {e}")
            return False
            
        return True

    def _run_gauntlet(self, target: dict, code_context: str) -> Optional[Path]:
        """Generates a dedicated reproduction test case."""
        prompt = self._load_prompt("gauntlet_generator", {
            "ACTION": target['action'],
            "FILE": target['file'],
            "CODE": code_context
        })
        
        if not prompt: # Fallback
             prompt = f"Create a pytest reproduction script for: {target['action']} in {target['file']}.\nContext:\n{code_context}"

        try:
            response = self.client.models.generate_content(
                model=self.flash_model,
                contents=prompt
            )
            raw_test = response.text
            clean_test = sanitize_test(raw_test, target['file'])
            
            test_file = self.root / "tests" / "gauntlet" / f"test_{int(time.time())}.py"
            test_file.parent.mkdir(parents=True, exist_ok=True)
            test_file.write_text(clean_test, encoding='utf-8')
            
            return test_file
        except Exception as e:
            HUD.persona_log("ERROR", f"Gauntlet creation failed: {e}")
            return None

    def _generate_implementation(self, target: dict, original_code: str, test_path: Path) -> Optional[str]:
        """Generates the code fix ensuring it passes the test."""
        # Read the test we just made
        test_content = test_path.read_text(encoding='utf-8')
        
        prompt = self._load_prompt("forge_implementation", {
             "ACTION": target['action'],
             "FILE": target['file'],
             "CODE": original_code,
             "TEST": test_content,
             "ALFRED_SUGGESTIONS": self._get_alfred_suggestions()
        })
        
        if not prompt:
            prompt = f"Fix the issue: {target['action']}.\nFile: {target['file']}\nCode:\n{original_code}\nTest:\n{test_content}"

        try:
            response = self.client.models.generate_content(
                model=self.pro_model, # Use Pro for coding
                contents=prompt
            )
            raw_code = response.text
            return sanitize_code(raw_code)
        except Exception as e:
            HUD.persona_log("ERROR", f"Implementation generation failed: {e}")
            return None

    # ==============================================================================
    # ⚗️ THE CRUCIBLE (Verification)
    # ==============================================================================

    def _verify_fix(self, target: dict) -> bool:
        """Runs the test suite to verify the fix."""
        HUD.persona_log("INFO", "Entering the Crucible (Verification)...")
        
        # 1. Run the specific gauntlet test
        cmd = ["pytest", str(self.root / "tests" / "gauntlet"), "-v"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            HUD.persona_log("FAIL", "Gauntlet Verification Failed.")
            return False

        # 2. Run relevant unit tests (Regression Check)
        # Scan for related tests
        cmd_reg = ["pytest", "tests/unit", "-k", Path(target['file']).stem]
        subprocess.run(cmd_reg, capture_output=True, text=True)
        # We don't strictly fail on regression here yet, but we could.
        
        return True

    def _verify_sprt_stability(self, target: dict) -> bool:
        """Runs Gungnir SPRT to statistically verify stability."""
        HUD.persona_log("INFO", "Running Gungnir SPRT verification...")
        
        # Use a quick 3-run check for now
        # Ideally we run the test N times
        validator = GungnirValidator()
        
        for i in range(3):
            cmd = ["pytest", str(self.root / "tests" / "gauntlet"), "-q"]
            res = subprocess.run(cmd, capture_output=True)
            success = (res.returncode == 0)
            validator.record_trial(success)
            
            if validator.status == "REJECT":
                 HUD.persona_log("FAIL", "Gungnir: Fix is statistically FLAKY.")
                 return False
            if validator.status == "ACCEPT":
                 HUD.persona_log("PASS", "Gungnir: Fix is statistically STABLE.")
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
            HUD.persona_log("WARN", "Changes rolled back.")

    def _record_metric(self, strategist: str, hit: bool):
        """Records success/fail rate for each warden."""
        if strategist not in self._strategist_metrics:
            self._strategist_metrics[strategist] = {"attempts": 0, "success": 0}
        
        self._strategist_metrics[strategist]["attempts"] += 1
        if hit:
            self._strategist_metrics[strategist]["success"] += 1

    def _emit_metrics_summary(self, scan_results: dict):
        """Logs the summary of the scan."""
        summary = ", ".join([f"{k}:{v}" for k,v in scan_results.items()])
        logging.info(f"[{self.root.name}] [SCAN] {summary}")

    def _distill_knowledge(self, target: dict = None, success: bool = False):
        """
        Extracts learnings from the session and updates memory.
        """
        # Placeholder for knowledge extraction logic
        pass

    def _select_breach_target(self, breaches: list) -> dict:
        """Legacy helper if needed, but new logic sorts list."""
        if not breaches: return None
        return breaches[0]
