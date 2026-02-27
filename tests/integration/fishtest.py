#!/usr/bin/env python3
"""
[ODIN] Fishtest Validator (fishtest.py)
Statistical intent resolution validator comparing results against ground truth.
Refined for the Linscott Standard.
"""

import json
import math
import os
import sys
import time
from typing import Any

# Add project root to path for src imports
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)
try:
    from src.core import utils
    from src.core.engine.vector import SovereignVector
    from src.core.report_engine import ReportEngine
except ImportError as e:
    print(f"CRITICAL ERROR: Failed to import engine modules: {e}")
    sys.path.append(os.path.join(PROJECT_ROOT, "src")) # Fallback
    try:
        from core import utils
        from core.engine.vector import SovereignVector
        from core.report_engine import ReportEngine
    except ImportError:
        print("FATAL: Could not locate engine in src/core. Check installation.")
        sys.exit(1)

try:
    from src.core.sovereign_hud import SovereignHUD
except ImportError:
    # Dummy SovereignHUD for headless or local runs if sv_engine/ui fails
    class SovereignHUD:
        RED = "\033[31m"; GREEN = "\033[32m"; YELLOW = "\033[33m"
        CYAN = "\033[36m"; MAGENTA = "\033[35m"; BOLD = "\033[1m"; DIM = "\033[2m"; RESET = "\033[0m"
        PERSONA = "ALFRED"
        @staticmethod
        def box_top(t=""): print(f"\n--- {t} ---")
        @staticmethod
        def box_row(l, v, c="", dim_label=False): print(f"{l}: {v}")
        @staticmethod
        def box_separator(): print("-" * 40)
        @staticmethod
        def box_bottom(): print("-" * 40 + "\n")
        @staticmethod
        def log(lv, msg, d=""): print(f"[{lv}] {msg} {d}")
        @staticmethod
        def progress_bar(v, w=10): return "[" + "="*int(v*w) + " "*int(w-v*w) + "]"


class SPRT:
    """Sequential Probability Ratio Test for automated verification."""

    def __init__(self, alpha: float = 0.05, beta: float = 0.05, p0: float = 0.90, p1: float = 0.99) -> None:
        self.la = math.log(beta / (1 - alpha))
        self.lb = math.log((1 - beta) / alpha)
        self.p0, self.p1 = p0, p1

    def evaluate(self, passed: int, total: int) -> tuple[str, str]:
        """Calculates the Likelihood Ratio for the passed test count."""
        if total == 0:
            return "INCONCLUSIVE", SovereignHUD.YELLOW
        llr = (passed * math.log(self.p1 / self.p0)) + \
              ((total - passed) * math.log((1 - self.p1) / (1 - self.p0)))

        if llr >= self.lb:
            return "PASS (Confirmed)", SovereignHUD.GREEN
        if llr <= self.la:
            return "FAIL (Regression)", SovereignHUD.RED
        return "INCONCLUSIVE", SovereignHUD.YELLOW


class FishtestRunner:
    """
    Orchestrates the execution of intent resolution test cases.
    """

    def __init__(self, data_file: str = "fishtest_data.json") -> None:
        self.data_file = data_file
        self.current_dir = os.path.dirname(os.path.abspath(__file__))
        self.base_path = os.path.join(PROJECT_ROOT, ".agent")
        self.engine, self.persona = self._initialize_engine()
        SovereignHUD.PERSONA = self.persona

    def _initialize_engine(self) -> tuple[SovereignVector, str]:
        """Initializes the SovereignVector engine with local and global skills."""
        config_path = os.path.join(self.base_path, "config.json")
        try:
            with open(config_path, encoding='utf-8') as f:
                config = json.load(f)
        except (OSError, json.JSONDecodeError):
            print(f"WARN: Could not load config from {config_path}")
            config = {}

        # [ALFRED] Handle nested config schema
        sys_config = config.get("system", {})
        persona = sys_config.get("persona", config.get("Persona", "ALFRED")).upper()
        root = sys_config.get("framework_root", config.get("FrameworkRoot"))

        engine = SovereignVector(
            thesaurus_path=os.path.join(PROJECT_ROOT, "src", "data", "thesaurus.qmd"),
            corrections_path=os.path.join(self.base_path, "corrections.json"),
            stopwords_path=os.path.join(PROJECT_ROOT, "src", "data", "stopwords.json")
        )
        engine.load_core_skills()
        # Load Local Skills from src/skills/local
        engine.load_skills_from_dir(os.path.join(PROJECT_ROOT, "src", "skills", "local"))

        if root and os.path.exists(os.path.join(root, "skills_db")):
            engine.load_skills_from_dir(os.path.join(root, "skills_db"), prefix="GLOBAL:")

        engine.build_index()
        return engine, persona

    def run_case(self, case: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
        """Executes a single test case query and validates the result."""
        # Defensive validation
        is_malformed = not isinstance(case, dict) or not case.get('query')
        if not is_malformed:
            if case.get('expected') is None and case.get('expected_mode') != 'none':
                is_malformed = True

        if is_malformed:
            return False, {"actual": None, "score": 0, "reasons": ["Malformed Case"]}

        try:
            results = self.engine.search(case['query'])
            top = results[0] if results else {}
            actual = top.get('trigger')
            score = top.get('score', 0)
            is_global = top.get('is_global', False)

            reasons = []
            if case.get('expected_mode') != 'none':
                if actual != case['expected'] and not (case['expected'] == "SovereignFish" and actual and "Fish" in str(actual)):
                    reasons.append(f"Expected '{case['expected']}', Got '{actual}'")

            if 'min_score' in case and score < case['min_score']:
                reasons.append(f"Score {score:.2f} < Min {case['min_score']}")
                
            # [ALFRED] The "Honest Classifier" check.
            if 'max_score' in case and score > case['max_score']:
                reasons.append(f"Score {score:.2f} > Max {case['max_score']} (Engine hallucinated confidence)")

            if 'should_be_global' in case and is_global != case['should_be_global']:
                reasons.append(f"Global mismatch: {is_global} != {case['should_be_global']}")
            
            # [ALFRED] Append extra debug info for failures
            if reasons:
                reasons.append(f"Top 1 Score: {score:.2f}")
                if len(results) > 1:
                    reasons.append(f"Top 2: '{results[1].get('trigger')}' ({results[1].get('score', 0):.2f})")

            return len(reasons) == 0, {"actual": actual, "score": score, "reasons": reasons}
        except Exception as e:
            return False, {"actual": None, "score": 0, "reasons": [f"Runtime Error: {str(e)[:40]}"]}

    def execute_suite(self) -> None:
        """Main suite runner loop."""
        try:
            with open(self.data_file, encoding='utf-8') as f:
                cases = json.load(f).get('test_cases', [])
        except (OSError, json.JSONDecodeError) as e:
            SovereignHUD.log("FAIL", "Load Error", str(e))
            sys.exit(1)

        if not cases:
            SovereignHUD.log("WARN", "EMPTY", "No test cases found.")
            return

        SovereignHUD.box_top("Ω THE CRUCIBLE Ω" if self.persona == "ODIN" else "Linguistic Integrity Briefing")
        SovereignHUD.box_row("TIMESTAMP", time.strftime("%H:%M:%S"), dim_label=True)
        SovereignHUD.box_row("POPULATION", f"{len(cases)} Cases", SovereignHUD.BOLD)
        SovereignHUD.box_separator()

        passed, skipped, start = 0, 0, time.time()
        for case in cases:
            query = str(case.get('query', ''))
            # [ALFRED] English Only Filter: Skip non-ASCII queries (CJK/Cyrillic/etc.)
            if not all(ord(c) < 128 for c in query):
                skipped += 1
                continue

            ok, info = self.run_case(case)
            if ok:
                passed += 1
            else:
                SovereignHUD.box_row("FAIL", case['query'], SovereignHUD.RED)
                for r in info['reasons']:
                    SovereignHUD.box_row("  -", r, dim_label=True)
                SovereignHUD.box_separator()

        duration = time.time() - start
        active_cases = len(cases) - skipped
        accuracy = (passed / active_cases) * 100 if active_cases > 0 else 0
        sprt_msg, sprt_color = SPRT().evaluate(passed, active_cases)

        if skipped:
            SovereignHUD.box_row("SKIPPED", f"{skipped} (Non-En)", SovereignHUD.YELLOW)
        SovereignHUD.box_row("ACCURACY", f"{accuracy:.1f}%", SovereignHUD.GREEN if accuracy == 100 else SovereignHUD.YELLOW)
        SovereignHUD.box_row("VERDICT", sprt_msg, sprt_color)
        SovereignHUD.box_row("LATENCY", f"{(duration/len(cases))*1000:.2f}ms/target", dim_label=True)
        SovereignHUD.box_bottom()

        # [ODIN] Persona-driven Final Report
        report = ReportEngine()
        body = f"""
| Metric | Value |
| :--- | :--- |
| **Population** | {len(cases)} |
| **Skipped** | {skipped} |
| **Accuracy** | {accuracy:.1f}% |
| **Latency** | {(duration/len(cases))*1000:.2f}ms |
        """
        verdict_status = "PASS" if accuracy >= 90 else "FAIL"
        verdict_detail = sprt_msg

        body += report.verdict(verdict_status, verdict_detail)
        print(report.generate_report("INTENT RESOLUTION AUDIT", body))

        if accuracy < 90:
            sys.exit(1)


def main() -> None:
    """CLI Entry point for fishtest."""
    target = 'fishtest_data.json'
    if len(sys.argv) > 2 and sys.argv[1] == '--file':
        target = sys.argv[2]

    runner = FishtestRunner(data_file=target)
    runner.execute_suite()


if __name__ == "__main__":
    main()
