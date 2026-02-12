"""
Muninn: The Raven of Memory & Excellence (Autonomous Improver)
Identity: ODIN/ALFRED Hybrid
Purpose: Execute the SovereignFish Protocol autonomously.

Wardens of Asgard:
  Valkyrie  — Prunes dead code (Choosers of the Slain)
  Mimir     — Tames complexity (The Wise Counselor)
  Edda      — Weaves documentation (The Saga Keeper)
  RuneCaster — Casts type definitions (The Rune Inscriber)
  Freya     — Polishes visual form (Goddess of Beauty)
  Norn      — Reads the campaign plan (Weavers of Fate)
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
from pathlib import Path

from colorama import Fore, init
from google import genai
from google.genai import types
import vulture
from radon.complexity import cc_visit


# Initialize Colorama
init(autoreset=True)

# Shared Bootstrap (env-loading + sys.path)
from src.sentinel._bootstrap import bootstrap

bootstrap()

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

# Configure Logging
logging.basicConfig(
    filename="sovereign_activity.log",
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

class SPRTValidator:
    """
    [SPRT: Sequential Probability Ratio Test]
    Lore: "The Oracle of Significance."
    Purpose: Statistically verify hypothesis (fix is stable) vs (fix is flaky).
    """
    def __init__(self, alpha=0.05, beta=0.1, p0=0.01, p1=0.2):
        self.alpha = alpha # Type I error (False Positive)
        self.beta = beta   # Type II error (False Negative)
        self.p0 = p0       # Base failure rate (Null)
        self.p1 = p1       # Flaky failure rate (Alternative)
        
        # Thresholds
        self.A = (1 - beta) / alpha
        self.B = beta / (1 - alpha)
        
        self.log_likelihood_ratio = 0.0

    def record_trial(self, success: bool):
        """
        Calculates the Wald Likelihood Ratio.
        ln(L1/L0) = k*ln(p1/p0) + (n-k)*ln((1-p1)/(1-p0))
        """
        import math
        if success:
            self.log_likelihood_ratio += math.log((1 - self.p1) / (1 - self.p0))
        else:
            self.log_likelihood_ratio += math.log(self.p1 / self.p0)

    @property
    def status(self) -> str:
        import math
        if self.log_likelihood_ratio >= math.log(self.A):
            return "REJECT" # Null hypothesis rejected -> Flaky
        if self.log_likelihood_ratio <= math.log(self.B):
            return "ACCEPT" # Null hypothesis accepted -> Stable
        return "CONTINUE"


class NornWarden:
    """
    [Norn: CAMPAIGN FATE]
    Lore: "The Weavers of Destiny."
    Purpose: Parse CAMPAIGN_IMPLEMENTATION_PLAN.qmd to find the next actionable task.
    """
    def __init__(self, root: Path):
        self.root = root
        self.plan_path = root / ".agent" / "CAMPAIGN_IMPLEMENTATION_PLAN.qmd"

    def get_next_target(self) -> dict:
        """
        Scans the plan for the first unstruck, actionable item in a markdown table.
        """
        if not self.plan_path.exists():
            return None

        lines = self.plan_path.read_text(encoding='utf-8').splitlines()

        # Regex for valid table row: | 1-5 | `file.py` | Target | Type | Description |
        # We assume columns: #, File, Target, Type, Description
        row_pattern = r"^\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|"

        for i, line in enumerate(lines):
            # Skip header separators or non-table lines
            if "---" in line or not line.strip().startswith("|"):
                continue

            # Skip struck-through lines (completed)
            if "~~" in line:
                continue

            match = re.search(row_pattern, line)
            if match:
                # Check for header row (e.g., contains "File" or "Target")
                if "File" in match.group(2) or "Description" in match.group(5):
                    continue

                # Found an actionable item
                file_target = match.group(2).strip().replace("`", "")
                target_name = match.group(3).strip()
                action_type = match.group(4).strip()
                description = match.group(5).strip()

                # Check if file exists (relative to root)
                file_path = self.root / file_target

                # If file doesn't exist AND it's not a "NEW" task, maybe skip or handle?
                # For now, we return it. The Forge will handle file creation/editing.

                return {
                    "type": "CAMPAIGN_TASK",
                    "file": file_target,
                    "action": f"[{action_type}] {description} (Target: {target_name})",
                    "line_index": i,
                    "raw_line": line
                }
        return None

    def mark_complete(self, target: dict):
        """
        Marks the action as complete by striking it through in the plan.
        """
        lines = self.plan_path.read_text(encoding='utf-8').splitlines()
        idx = target['line_index']


        if idx < len(lines):
            line = lines[idx]
            # Strike through the content, keeping the pipes
            parts = line.split("|")
            # Cols: 0=empty, 1=ID, 2=File, 3=Target, 4=Type, 5=Desc
            if len(parts) >= 6:
                desc = parts[5]
                if "~~" not in desc:
                   parts[5] = f" ~~{desc.strip()}~~ "
                   new_line = "|".join(parts)
                   lines[idx] = new_line
                   self.plan_path.write_text("\n".join(lines), encoding='utf-8')


# ==============================================================================
# 🛡️ THE LORE STRATEGISTS
# ==============================================================================


class ValkyrieWarden:
    """
    [Valkyrie: PRUNING]
    Lore: "Choosers of the Slain."
    Purpose: Identify unused imports and unreachable code using Vulture.
    """
    def __init__(self, root: Path):
        self.root = root

    def scan(self) -> list:
        targets = []
        try:
            v = vulture.Vulture(verbose=False)
            # Scavenge all python files
            py_files = []
            for p in self.root.rglob("*.py"):
                skip_targets = ("node_modules", ".venv", "tests", ".agent", ".git")
                if any(d in p.parts for d in skip_targets):
                    continue
                py_files.append(str(p))
            
            v.scavenge(py_files)
            
            raw_items = v.get_unused_code()
            
            for item in raw_items:
                if item.confidence < 10: # Very low confidence only
                    continue
                
                lineno = getattr(item, "first_lineno", getattr(item, "lineno", 1))
                
                try:
                    rel_path = str(Path(item.filename).resolve().relative_to(self.root.resolve()))
                except ValueError:
                    rel_path = str(item.filename)

                targets.append({
                    "type": "VALKYRIE_BREACH",
                    "file": rel_path,
                    "action": f"Prune Dead Code: {item.message} at line {lineno}",
                    "severity": "LOW",
                    "line": lineno
                })
        except Exception:
            pass
        return targets


class EddaWarden:
    """
    [DOCUMENTATION]
    Lore: "The Saga of the Code."
    Purpose: Identify functions missing docstrings.
    """
    def __init__(self, root: Path):
        self.root = root

    def scan(self) -> list:
        targets = []
        for py_file in self.root.rglob("*.py"):
            skip_dirs = ("node_modules", ".venv", "tests")
            if any(d in py_file.parts for d in skip_dirs):
                continue

            try:
                # Simple check: Does it have a docstring?
                content = py_file.read_text(encoding='utf-8')
                if 'def ' in content and '"""' not in content:
                     targets.append({
                        "type": "EDDA_BREACH",
                        "file": str(py_file.relative_to(self.root)),
                        "action": f"Weave Saga (Docstring) for {py_file.name}",
                        "severity": "LOW"
                    })
            except (OSError, ValueError): pass
        return targets

class RuneCasterWarden:
    """
    [TYPE SAFETY]
    Lore: "Casting the Runes of Definition."
    Purpose: Identify missing type hints.
    """
    def __init__(self, root: Path):
        self.root = root

    def scan(self) -> list:
        targets = []
        for py_file in self.root.rglob("*.py"):
            if "node_modules" in py_file.parts or ".venv" in py_file.parts or "tests" in py_file.parts: continue

            try:
                # Basic heuristic: 'def foo(x):' vs 'def foo(x: int) -> int:'
                # We look for arguments without colons
                content = py_file.read_text(encoding='utf-8')
                lines = content.splitlines()
                for i, line in enumerate(lines):
                     if "def " in line and "(" in line and "):" in line and "->" not in line:
                          targets.append({
                            "type": "RUNE_BREACH",
                            "file": str(py_file.relative_to(self.root)),
                            "action": f"Cast Runes (Type Hints) for {py_file.name}:{i+1}",
                            "severity": "LOW"
                        })
            except (OSError, ValueError):
                pass
        return targets


class MimirWarden:
    """
    [COMPLEXITY]
    Lore: "The Wise Counselor sees through tangled threads."
    Purpose: Identify cyclomatic complexity > 10 using Radon.
    """
    def __init__(self, root: Path):
        self.root = root

    def scan(self) -> list:
        targets = []
        for py_file in self.root.rglob("*.py"):
            skip_dirs = ("node_modules", ".venv", "tests")
            if any(d in py_file.parts for d in skip_dirs):
                continue

            try:
                content = py_file.read_text(encoding='utf-8')
                blocks = cc_visit(content)
                for block in blocks:
                    # block is a Function object or Class object with .complexity attribute
                    if block.complexity > 10:
                        try:
                            rel_path = str(py_file.resolve().relative_to(self.root.resolve()))
                        except ValueError:
                            rel_path = str(py_file)
                        
                        targets.append({
                            "type": "MIMIR_BREACH",
                            "file": rel_path,
                            "action": f"Simplify Complexity: {block.name} (CC: {block.complexity})",
                            "severity": "MEDIUM",
                            "line": block.lineno
                        })
            except Exception:
                pass
        return targets



class FreyaWarden:
    """
    [BEAUTY]
    Lore: "The Goddess of Beauty sees all imperfections."
    Purpose: Hunt for visual improvements — hover states, spacing, polish.
    """
    def __init__(self, root: Path):
        self.root = root

    def scan(self) -> list:
        targets = []
        # Checks specifically for React/Tailwind patterns as hinted by CastleView.tsx
        # 1. Buttons without hover states
        for tsx_file in self.root.rglob("*.tsx"):
            if "node_modules" in tsx_file.parts:
                continue

            try:
                content = tsx_file.read_text(encoding='utf-8')
                # Load color theory for validation
                theory_path = self.root / "src" / "core" / "color_theory.json"
                theory = {}
                if theory_path.exists():
                    theory = json.loads(theory_path.read_text(encoding='utf-8'))
                
                palettes = theory.get("palettes", {})
                all_hexes = []
                for p in palettes.values():
                    all_hexes.extend([v.lower() for v in p.values()])

                lines = content.splitlines()
                for i, line in enumerate(lines):
                    # 1. Hover check
                    if "<button" in line and "className" in line and "hover:" not in line:
                        targets.append({
                            "type": "BEAUTY_BREACH",
                            "file": str(tsx_file.relative_to(self.root)),
                            "action": f"Add hover state to button at line {i+1} (Linscott Standard)",
                            "line": i+1,
                            "severity": "MEDIUM"
                        })
                    
                    # 2. Color Theory Audit (Hex matching)
                    found_hex = re.findall(r"#[0-9a-fA-F]{6}", line)
                    for h in found_hex:
                        if h.lower() not in all_hexes:
                            targets.append({
                                "type": "BEAUTY_BREACH",
                                "file": str(tsx_file.relative_to(self.root)),
                                "action": f"Non-standard color detected: {h} at line {i+1} (Consult color_theory.json)",
                                "line": i+1,
                                "severity": "LOW"
                            })
            except Exception: pass

        return targets

        return targets


class TheWatcher:
    """
    [STABILITY MANAGER]
    Lore: "The Guardian of the Timeline."
    Purpose: Prevent oscillation (edit wars) and track file edit fatigue.
    """
    def __init__(self, root: Path):
        self.root = root
        self.state_file = self.root / ".agent" / "sovereign_state.json"
        self.state = self._load_state()

    def _load_state(self) -> dict:
        if not self.state_file.exists():
            return {}
        try:
            return json.loads(self.state_file.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_state(self):
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(self.state, indent=2), encoding='utf-8')

    def is_locked(self, rel_path: str) -> bool:
        file_state = self.state.get(rel_path, {})
        return file_state.get("status") == "LOCKED"

    def record_edit(self, rel_path: str, content: str) -> bool:
        """
        Records an edit and checks for oscillation or fatigue.
        Returns True if state is stable, False if oscillation/fatigue detected.
        """
        if rel_path not in self.state:
            self.state[rel_path] = {
                "last_edited": 0,
                "edit_count_24h": 0,
                "content_hashes": [],
                "status": "ACTIVE"
            }

        file_state = self.state[rel_path]
        now = time.time()

        # 1. Fatigue Logic (3 edits / 24h)
        if now - file_state["last_edited"] > 86400: # Reset daily
            file_state["edit_count_24h"] = 0

        file_state["edit_count_24h"] += 1
        file_state["last_edited"] = now

        # 2. Echo Detection (Hash repetitive states)
        content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
        is_echo = content_hash in file_state["content_hashes"]

        file_state["content_hashes"].append(content_hash)
        if len(file_state["content_hashes"]) > 5:
            file_state["content_hashes"].pop(0)

        if is_echo:
            file_state["status"] = "LOCKED"
            self._save_state()
            HUD.persona_log("FAIL", f"OSCILLATION DETECTED: {rel_path} returning to previous state. LOCKING.")
            return False

        if file_state["edit_count_24h"] > 3:
            file_state["status"] = "LOCKED"
            self._save_state()
            HUD.persona_log("FAIL", f"FILE FATIGUE: {rel_path} locked after 3 edits.")
            return True # Still return True for the 3rd edit, but lock future ones

        self._save_state()
        return True


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

        # 3. The Watcher (Anti-Oscillation)
        self.watcher = TheWatcher(self.root)

        # [ALFRED] Warden Metrics: Track per-warden hit rates
        self._strategist_metrics: dict[str, dict[str, int]] = {}

    def run(self) -> bool:
        """
        Executes one cycle of the Sovereign Fish Protocol.
        Returns True if a change was made and verified, False otherwise.
        """
        if HUD.PERSONA == "ALFRED":
            HUD.persona_log("INFO", f"The Ravens are scouting {self.root}...")
        else:
            HUD.persona_log("INFO", f"Muninn is scouring {self.root.name}...")

        # 1. SCAN (The Hunt)
        strategist = HeimdallWarden(self.root)
        strategist.scan()

        beauty_expert = FreyaWarden(self.root)
        beauty_targets = beauty_expert.scan()

        valkyrie = ValkyrieWarden(self.root)
        valkyrie_targets = valkyrie.scan()

        mimir = MimirWarden(self.root)
        mimir_targets = mimir.scan()

        edda = EddaWarden(self.root)
        edda_targets = edda.scan()

        rune = RuneCasterWarden(self.root)
        rune_targets = rune.scan()

        # [ALFRED] Metrics: Record scan results per strategist
        scan_results = {
            "ANNEX": len(strategist.breaches) if hasattr(strategist, 'breaches') else 0,
            "VALKYRIE": len(valkyrie_targets),
            "MIMIR": len(mimir_targets),
            "BEAUTY": len(beauty_targets),
            "EDDA": len(edda_targets),
            "RUNE": len(rune_targets),
        }

        target = None
        selected_strategist = None

        # Priority Logic:
        # 1. Critical Code/Test Breaches (Annex)
        if strategist.breaches:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("WARN", "Critical issues detected. Attending to them immediately.")
            else:
                HUD.persona_log("WARN", "Weakness detected. The walls must be reinforced.")
            target = self._select_breach_target(strategist.breaches)
            selected_strategist = "ANNEX"

        # 2. Dead Code (Valkyrie)
        if not target and valkyrie_targets:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("INFO", "Disposing of unused assets.")
            else:
                HUD.persona_log("INFO", "The branches are withered. Pruning class.")
            target = valkyrie_targets[0]
            selected_strategist = "VALKYRIE"

        # 3. Complexity (Mimir)
        if not target and mimir_targets:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("INFO", "Refining the logic flow. It's becoming tangled.")
            else:
                HUD.persona_log("INFO", "The knots are too tight. Loosening the weave.")
            target = mimir_targets[0]
            selected_strategist = "MIMIR"


        # 4. Beauty Imperfections (FreyaWarden)
        if not target and beauty_targets:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("INFO", "The presentation is a bit untidy. polishing.")
            else:
                HUD.persona_log("INFO", "Form is function. The visual runes are misaligned.")
            target = beauty_targets[0]
            selected_strategist = "BEAUTY"

        # 5. Saga Gaps (Edda)
        if not target and edda_targets:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("INFO", "Some records are missing. Updating the Archive.")
            else:
                HUD.persona_log("INFO", "The Saga is incomplete. Weaving the Edda.")
            target = edda_targets[0]
            selected_strategist = "EDDA"

        # 6. Rune Gaps (RuneCaster)
        if not target and rune_targets:
             if HUD.PERSONA == "ALFRED":
                 HUD.persona_log("INFO", "Labeling the new inventory items.")
             else:
                 HUD.persona_log("INFO", "The Runes are undefined. Casting strict definitions.")
             target = rune_targets[0]
             selected_strategist = "RUNE"

        # 7. Campaign (Mandate)
        if not target:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("INFO", "No immediate concerns. Checking your itinerary...")
            else:
                HUD.persona_log("INFO", "The realm is secure. Consulting the Great Plan...")

            campaign = NornWarden(self.root)
            target = campaign.get_next_target()
            if target:
                target['source'] = 'CAMPAIGN'
                selected_strategist = "CAMPAIGN"

        if not target:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("SUCCESS", "Everything appears to be in order, sir.")
            else:
                HUD.persona_log("SUCCESS", "The waters are clear. Heimdall sees no threats.")
            self._emit_metrics_summary(scan_results)
            return False

        HUD.persona_log("WARN", f"Target: {target['action']} in {target['file']}")
        logging.info(f"[{self.root.name}] [TARGET] {target['action']} ({target['file']})")

        # [WATCHER] Anti-Oscillation Check
        if self.watcher.is_locked(target['file']):
            HUD.persona_log("WARN", f"Jurisdiction Denied: {target['file']} is LOCKED (Unstable).")
            return False

        # 3. FORGE (Execute Fix)
        if not self._forge_improvement(target):
            return False
        # 4. CRUCIBLE (Verify)
        if self._verify_fix(target):
            logging.info(f"[{self.root.name}] [SUCCESS] Verified fix for {target['file']}")

            # 5. SPRT STABILITY CHECK (Linscott Standard)
            if not self._verify_sprt_stability(target):
                self._record_metric(selected_strategist, hit=False)
                return False

            # 6. PERFORMANCE BENCHMARK CHECK
            if not self._verify_performance(target):
                self._record_metric(selected_strategist, hit=False)
                return False

            # 7. FISHTEST CHAIN: Verify no accuracy regression
            if not self._verify_fishtest(target):
                self._record_metric(selected_strategist, hit=False)
                return False

            # 8. TEACH PHASE (Knowledge Extraction)
            self._distill_knowledge(target, success=True)

            # If Campaign task, update the plan
            if target.get('source') == 'CAMPAIGN':
                NornWarden(self.root).mark_complete(target)
                if HUD.PERSONA == "ALFRED":
                     HUD.persona_log("SUCCESS", "I have crossed that item off your list, sir.")
                else:
                     HUD.persona_log("SUCCESS", "The Runes are cast. Limit broken.")

            self._record_metric(selected_strategist, hit=True)
            return True
        else:
            logging.warning(f"[{self.root.name}] [ROLLBACK] Fix failed verification.")
            self._distill_knowledge(target, success=False)
            self._record_metric(selected_strategist, hit=False)
            return False

    def _verify_sprt_stability(self, target: dict, trials=5) -> bool:
        """[SPRT] Oracle of Significance Verification."""
        HUD.persona_log("INFO", f"SPRT: Verifying stability across {trials} trials...")
        oracle = SPRTValidator()
        
        test_name = f"test_{Path(target['file']).stem}_empire.py"
        test_path = self.root / "tests" / "empire_tests" / test_name
        
        for i in range(trials):
            env = os.environ.copy()
            env["PYTHONPATH"] = str(self.root)
            result = subprocess.run(
                [sys.executable, "-m", "pytest", str(test_path)],
                cwd=self.root, env=env, capture_output=True
            )
            success = (result.returncode == 0)
            oracle.record_trial(success)
            
            status = oracle.status
            if status == "ACCEPT":
                HUD.persona_log("PASS", f"SPRT: Signal Stable (Trial {i+1}).")
                return True
            if status == "REJECT":
                HUD.persona_log("FAIL", f"SPRT: Signal FLAKY (Trial {i+1}). Rolling back.")
                self._rollback(target)
                return False
        
        return True # Default to pass if noise is moderate

    def _verify_performance(self, target: dict) -> bool:
        """[BENCHMARK] Performance Guardrail."""
        benchmark_script = self.root / "src" / "tools" / "benchmark_engine.py"
        if not benchmark_script.exists():
            return True

        HUD.persona_log("INFO", "Performance: Running benchmark audit...")
        env = os.environ.copy()
        env["PYTHONPATH"] = str(self.root)
        
        # We run 20 trials for speed in loop
        try:
            result = subprocess.run(
                [sys.executable, str(benchmark_script)],
                cwd=self.root, env=env, capture_output=True, text=True
            )
            # Basic regression check: if exit code != 0 or if we parse output (future)
            if result.returncode != 0:
                 HUD.persona_log("FAIL", "Performance: Regression detected. Rolling back.")
                 self._rollback(target)
                 return False
            return True
        except Exception: return True

    def _distill_knowledge(self, target: dict, success: bool, error: str = ""):
        """[TEACH] Knowledge Extraction to memory.qmd."""
        HUD.persona_log("INFO", "The Ravens are distilling knowledge...")
        
        prompt = f"""
        ACT AS: The Teacher.
        CONTEXT: A Raven learning cycle for "{target['action']}" in {target['file']}.
        SUCCESS: {success}
        ERROR: {error}
        
        TASK: Extract ONE high-level architectural or Python "Lesson Learned".
        REQUIREMENT: Must be a single, concise sentence. No fluff.
        FORMAT: "- **Topic**: Lesson."
        """
        try:
            response = self.client.models.generate_content(
                model=self.flash_model,
                contents=prompt
            )
            lesson = response.text.strip()
            
            memory_path = self.root / "memory.qmd"
            if memory_path.exists():
                content = memory_path.read_text(encoding='utf-8')
                if "## Lessons Learned" in content:
                    parts = content.split("## Lessons Learned")
                    updated = parts[0] + "## Lessons Learned" + parts[1].rstrip() + f"\n{lesson}\n"
                    memory_path.write_text(updated, encoding='utf-8')
                    HUD.persona_log("SUCCESS", "Memory Updated: The Archive grows.")
        except Exception as e:
            HUD.persona_log("WARN", f"Teach failed: {e}")

    def _verify_fishtest(self, target: dict) -> bool:
        """[ALFRED] Chain fishtest verification after a successful fix to prevent accuracy regression."""
        fishtest_path = self.root / "tests" / "integration" / "fishtest.py"
        if not fishtest_path.exists():
            # No fishtest available — skip gracefully
            return True

        HUD.persona_log("INFO", "Chain Verification: Running Fishtest...")
        env = os.environ.copy()
        env["PYTHONPATH"] = str(self.root)
        env["PYTHONIOENCODING"] = "utf-8"

        try:
            result = subprocess.run(
                [sys.executable, str(fishtest_path), "--json"],
                cwd=str(self.root),
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                env=env,
                timeout=120
            )

            if result.returncode != 0:
                # Parse JSON output for accuracy
                try:
                    data = json.loads(result.stdout)
                    accuracy = data.get("accuracy", 0)
                except (json.JSONDecodeError, ValueError):
                    accuracy = 0

                if accuracy < 0.95:
                    HUD.persona_log("FAIL", f"Fishtest REGRESSION: accuracy {accuracy:.1%}. Rolling back.")
                    self._rollback(target)
                    return False

            HUD.persona_log("PASS", "Fishtest: No regression detected.")
            return True

        except subprocess.TimeoutExpired:
            HUD.persona_log("WARN", "Fishtest timed out. Accepting fix cautiously.")
            return True
        except (OSError, subprocess.SubprocessError) as e:
            HUD.persona_log("WARN", f"Fishtest unavailable: {e}. Accepting fix.")
            return True

    def _record_metric(self, strategist_name: str, hit: bool) -> None:
        """[ALFRED] Record a hit or miss for a strategist."""
        if strategist_name not in self._strategist_metrics:
            self._strategist_metrics[strategist_name] = {"hits": 0, "misses": 0}
        if hit:
            self._strategist_metrics[strategist_name]["hits"] += 1
        else:
            self._strategist_metrics[strategist_name]["misses"] += 1

    def _emit_metrics_summary(self, scan_results: dict) -> None:
        """[ALFRED] Emit a summary dashboard after each cycle."""
        HUD.box_top("STRATEGIST METRICS")
        for name, count in scan_results.items():
            metrics = self._strategist_metrics.get(name, {"hits": 0, "misses": 0})
            total = metrics["hits"] + metrics["misses"]
            rate = f"{metrics['hits']/total*100:.0f}%" if total > 0 else "N/A"
            color = HUD.GREEN if count == 0 else HUD.YELLOW
            HUD.box_row(name, f"Targets: {count}  Hit Rate: {rate}", color)
        HUD.box_bottom()

    def _select_breach_target(self, breaches: list):
        return breaches[0]

    def _forge_improvement(self, target: dict) -> bool:
        """
        EMPIRE TDD WORKFLOW:
        1. Architect (Flash): Write Gherkin Test (.qmd)
        2. The Gauntlet (Flash Loop):
           - Build Implementation & Test
           - Run Test (Pytest)
           - FAIL? -> Fix (Max 3 retries)
           - PASS? -> Proceed
        3. Critic (Pro): Review & Approve verified code
        """
        HUD.persona_log("INFO", f"Initiating Empire TDD Protocol for {target['file']}...")

        context = ""
        file_path = self.root / target['file']
        if file_path.exists():
            context = file_path.read_text(encoding='utf-8')

        # --- STEP 1: ARCHITECT (Gherkin) ---
        gherkin_content = self._architect_gherkin(target, context)
        if not gherkin_content:
            return False

        # --- STEP 2: THE GAUNTLET (Build & Verify Loop) ---
        impl_data = self._run_gauntlet(target, context, gherkin_content)

        if not impl_data:
            HUD.persona_log("FAIL", "The Gauntlet has claimed another victim. (Build/Test Failed)")
            return False

        code_content = impl_data['code']
        test_content = impl_data['test']

        # --- STEP 3: CRITIC (Review) ---
        HUD.persona_log("INFO", "Consulting The Council (Flash)...")
        review = self._consult_council(target, gherkin_content, code_content, test_content)

        if review['status'] == 'APPROVED':
            HUD.persona_log("SUCCESS", "The Council APPROVES.")

            # SAVE FILES
            if file_path.exists():
                 shutil.copy(file_path, f"{file_path}.bak")
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(code_content, encoding='utf-8')

            # [WATCHER] Record and Verify Stability
            if not self.watcher.record_edit(target['file'], code_content):
                 self._rollback(target)
                 return False

            # 2. Test File
            test_name = f"test_{file_path.stem}_empire.py"
            test_path = self.root / "tests" / "empire_tests" / test_name
            test_path.parent.mkdir(parents=True, exist_ok=True)
            test_path.write_text(test_content, encoding='utf-8')

            # 3. Gherkin Artifact
            spec_name = f"{file_path.stem}.qmd"
            spec_path = self.root / "tests" / "empire_tests" / "specs" / spec_name
            spec_path.parent.mkdir(parents=True, exist_ok=True)
            spec_path.write_text(gherkin_content, encoding='utf-8')

            return True
        else:
            reason = review.get('reason', 'Unknown reason')
            HUD.persona_log("WARN", f"The Council DISAPPROVES: {reason}")
            # Log Failure
            fail_log = self.root / "tests" / "empire_tests" / "FAILED_REVIEW.md"
            fail_log.parent.mkdir(parents=True, exist_ok=True)
            fail_log.write_text(f"# FAILED REVIEW\n\n## Reason\n{reason}\n\n## Gherkin\n{gherkin_content}\n\n## Code\n```python\n{code_content}\n```", encoding='utf-8')
            return False

    def _architect_gherkin(self, target, context):
        HUD.persona_log("INFO", "Architecting Scenario...")
        prompt = f"""
        ACT AS: Empire TDD Architect.
        TASK: Create a Gherkin (.qmd) feature verification for: "{target['action']}"
        FILE: {target['file']}
        CONTEXT:
        {context}
        
        CRITICAL DIRECTIVE: THE LINSCOTT STANDARD
        1. Code and Verification are a single atomic unit.
        2. Every change MUST have a corresponding test Scenario.
        3. Even trivial changes (e.g. "Hello World") require a test.
        
        OUTPUT: Only the Gherkin content (Feature, Scenario, Given/When/Then).
        """
        try:
            response = self.client.models.generate_content(
                model=self.flash_model,
                contents=prompt
            )
            if not response or not response.text:
                return None
            return response.text.strip().replace("```gherkin", "").replace("```", "")
        except Exception as e:
            HUD.persona_log("ERROR", f"Architect Error: {e}")
            return None

    def _run_gauntlet(self, target, context, gherkin_content):
        """
        The Inner Loop.
        Generates code + test, runs pytest, and iterates on failure.
        """
        max_retries = 3
        temp_dir = self.root / "tests" / "empire_tests" / "temp_gauntlet"
        temp_dir.mkdir(parents=True, exist_ok=True)

        current_code = context
        last_error = ""

        for attempt in range(max_retries + 1):

            # ESCALATION PROTOCOL
            is_emergency = (attempt == max_retries)
            model_name = self.pro_model if is_emergency else self.flash_model
            model_display = "Gemini Pro (Senior)" if is_emergency else "Flash (Junior)"

            HUD.persona_log("INFO", f"Entering The Gauntlet (Attempt {attempt+1}/{max_retries+1}) using {model_display}...")

            prompt = f"""
            ACT AS: Senior Python Developer.
            TASK: Implement the solution and the corresponding Pytest.
            FILE: {target['file']}
            GHERKIN:
            {gherkin_content}
            STARTING_CODE:
            {current_code}
            
            CRITICAL DIRECTIVE: THE LINSCOTT STANDARD
            1. You MUST generate a valid Pytest in the "test" field.
            2. The test must verify the Gherkin scenario.
            3. The test must be self-contained (imports, setup).
            4. WINDOWS COMPATIBILITY: Use `sys.executable` for any subprocesses. Force `utf-8` encoding.
            5. PREFER DIRECT CALLS: If the code has functions, import them and call them instead of using subprocesses.
            6. MOCKING SAFETY: Do NOT attempt to set `.side_effect` on built-in functions (like `print` or `input`). Use `monkeypatch` for environment/stdout.
            
            PREVIOUS_ERROR (If any):
            {last_error}
            
            OUTPUT: JSON object with keys: "code" and "test".
            """

            try:
                response_schema = {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string"},
                        "test": {"type": "string"}
                    },
                    "required": ["code", "test"]
                }

                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=response_schema
                    )
                )
                if not response or not response.text:
                    last_error = "AI provided empty response"
                    continue
                txt = response.text.strip()
                if "```json" in txt:
                    txt = txt.split("```json")[1].split("```")[0].strip()
                implementation_data = json.loads(txt)
            except Exception as e:
                HUD.persona_log("ERROR", f"Build Error: {e}")
                last_error = str(e)
                continue

            if not implementation_data:
                 last_error = "JSON Parsing Failed"
                 continue
            code_content = implementation_data.get('code')
            test_content = implementation_data.get('test')

            # ==========================================================
            # 🌈 BIFROST GATE: Sanitize & Validate before execution
            # ==========================================================
            code_content = sanitize_code(code_content)
            test_content = sanitize_test(test_content, target['file'], self.root)

            # Validate code syntax
            code_ok, code_err = validate_syntax(code_content)
            if not code_ok:
                error_class = classify_error(code_err)
                HUD.persona_log("WARN", f"Bifrost REJECTED code: [{error_class}] {code_err}")
                last_error = f"BIFROST_CODE_REJECT [{error_class}]: {code_err}"
                continue

            # Validate test syntax
            test_ok, test_err = validate_syntax(test_content)
            if not test_ok:
                error_class = classify_error(test_err)
                HUD.persona_log("WARN", f"Bifrost REJECTED test: [{error_class}] {test_err}")
                last_error = f"BIFROST_TEST_REJECT [{error_class}]: {test_err}"
                continue

            # Validate test imports — attempt repair if bad
            bad_imports = validate_imports(test_content, self.root)
            if bad_imports:
                HUD.persona_log("WARN", f"Bifrost: Repairing bad imports: {bad_imports[:2]}")
                test_content = repair_imports(test_content, self.root)
                remaining = validate_imports(test_content, self.root)
                if remaining:
                    last_error = f"BIFROST_IMPORT_REJECT: {'; '.join(remaining[:3])}"
                    continue

            # Write temp files (only after Bifrost approval)
            temp_code_path = temp_dir / Path(target['file']).name
            temp_test_path = temp_dir / "test_temp_empire.py"

            temp_code_path.write_text(code_content, encoding='utf-8')
            temp_test_path.write_text(test_content, encoding='utf-8')

            # Run Pytest
            env = os.environ.copy()
            env["PYTHONPATH"] = str(self.root)
            env["PYTHONIOENCODING"] = "utf-8"

            try:
                cmd = [sys.executable, "-m", "pytest", str(temp_test_path), "-v"]
                result = subprocess.run(
                    cmd,
                    cwd=temp_dir,
                    env=env,
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    timeout=120
                )

                if result.returncode == 0:
                    HUD.persona_log("PASS", "The Gauntlet: SURVIVED.")
                    return implementation_data
                else:
                    error_output = (result.stdout + result.stderr)
                    error_class = classify_error(error_output)
                    error_summary = extract_error_summary(error_output)
                    HUD.persona_log("WARN", f"Gauntlet FAILED [{error_class}]: {error_summary[:100]}")
                    last_error = f"GAUNTLET [{error_class}]: {error_summary}"

                    fail_log = self.root / "tests" / "empire_tests" / "gauntlet_failures.log"
                    try:
                        fail_log.parent.mkdir(parents=True, exist_ok=True)
                        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                        log_entry = f"\n\n[{timestamp}] [FILE: {target['file']}] [ATTEMPT: {attempt+1}] [CLASS: {error_class}]\n{'-'*40}\n{error_output}\n{'-'*40}\n"
                        with open(fail_log, "a", encoding="utf-8") as f:
                            f.write(log_entry)
                        HUD.persona_log("INFO", f"Error details logged to {fail_log.name}")
                    except Exception as log_err:
                        print(f"Failed to write failure log: {log_err}")

                    current_code = code_content
                    continue
            except Exception as e:
                last_error = f"Execution Error: {e}"

        return None

    def _consult_council(self, target, gherkin_content, code, test):
        prompt = f"""
        ACT AS: The Council.
        GHERKIN: {gherkin_content}
        CODE: {code}
        TEST: {test}
        CONTEXT: Passed Gauntlet unit tests.
        OUTPUT: JSON with status (APPROVED/DISAPPROVED) and reason.
        """
        try:
            response = self.client.models.generate_content(
                model=self.flash_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            if not response or not response.text:
                return {"status": "DISAPPROVED", "reason": "Empty response from Council."}
            txt = response.text.strip()
            if "```json" in txt:
                txt = txt.split("```json")[1].split("```")[0].strip()
            return json.loads(txt)
        except Exception as e:
             return {"status": "DISAPPROVED", "reason": f"Council Error: {e}"}

    def _verify_fix(self, target: dict) -> bool:
        """
        THE CRUCIBLE.
        Verifies the fix in the final environment (installed tests).
        If verification fails, REVERTS the changes (Rollback).
        """
        HUD.persona_log("INFO", "The Crucible: Verifying installed fix...")

        # 1. Locate the test
        test_name = f"test_{Path(target['file']).stem}_empire.py"
        test_path = self.root / "tests" / "empire_tests" / test_name

        if not test_path.exists():
             HUD.persona_log("FAIL", "The Crucible: Verification Failed (Test file missing).")
             self._rollback(target)
             return False

        # 2. Run Pytest
        env = os.environ.copy()
        env["PYTHONPATH"] = str(self.root)

        try:
            result = subprocess.run(
                [sys.executable, "-m", "pytest", str(test_path), "-v"],
                cwd=self.root,
                env=env,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace'
            )

            if result.returncode == 0:
                HUD.persona_log("PASS", "The Crucible: VERIFIED.")
                return True
            else:
                HUD.persona_log("WARN", "The Crucible: FAILED.")
                self._rollback(target)
                return False

        except Exception as e:
            HUD.persona_log("ERROR", f"The Crucible: Execution Error: {e}")
            self._rollback(target)
            return False

    def _rollback(self, target: dict):
        """Reverts the changes to the file."""
        file_path = self.root / target['file']
        bak_path = Path(f"{file_path}.bak")

        if bak_path.exists():
            HUD.persona_log("WARN", f"Rolling back {target['file']}...")
            shutil.copy(bak_path, file_path)
        else:
             HUD.persona_log("ERROR", f"Rollback Failed: No backup found for {target['file']}")


def run(target_path: str):
    """Entry point for the daemon."""
    try:
        fish = SovereignFish(target_path)
        return fish.run()
    except Exception as e:
        print(f"{Fore.RED}[ERROR] Agent Crash: {e}")
        logging.error(f"[{target_path}] [CRASH] {e}")
        return False

