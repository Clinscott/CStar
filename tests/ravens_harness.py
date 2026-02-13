"""
Ravens Harness: 100-Iteration Mock-Based Gauntlet Test Engine
Identity: ODIN
Purpose: Run the SovereignFish protocol N times against real codebase targets
using mock AI responses. Diagnose failure patterns and produce structured
JSON reports for iterative hardening.

Usage:
    python tests/ravens_harness.py --iterations 100
    python tests/ravens_harness.py --iterations 10 --dry-run
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel.code_sanitizer import (
    classify_error,
    extract_error_summary,
    repair_imports,
    sanitize_code,
    sanitize_test,
    validate_imports,
    validate_syntax,
)
from src.core.annex import HeimdallWarden
from src.sentinel.sovereign_fish import (
    SovereignFish,
    ValkyrieWarden,
    MimirWarden,
    EddaWarden,
    RuneCasterWarden,
    FreyaWarden,
)


FIXTURES_DIR = PROJECT_ROOT / "tests" / "fixtures" / "ravens_responses"
RESULTS_FILE = PROJECT_ROOT / "tests" / "ravens_harness_results.json"


# ==============================================================================
# MOCK RESPONSE BANK
# ==============================================================================


def load_mock_responses() -> list[dict]:
    """Load harvested AI responses from the fixtures dir."""
    mock_file = FIXTURES_DIR / "mock_responses.json"
    if mock_file.exists():
        with open(mock_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def generate_synthetic_responses(target_file: str) -> list[dict]:
    """
    Generate synthetic test responses for when no harvested responses exist.
    These cover the common failure patterns we want the sanitizer to catch.
    """
    base_name = Path(target_file).stem

    responses = [
        # 1. GOOD response — valid code + valid test
        {
            "type": "GOOD",
            "response_text": json.dumps({
                "code": f"def {base_name}_main():\n    \"\"\"Main function.\"\"\"\n    return True\n",
                "test": (
                    "import sys\n"
                    "from pathlib import Path\n"
                    f"_ROOT = Path(r\"{PROJECT_ROOT}\").resolve()\n"
                    "if str(_ROOT) not in sys.path:\n"
                    "    sys.path.insert(0, str(_ROOT))\n"
                    "import pytest\n\n"
                    f"def test_{base_name}_exists():\n"
                    f"    assert True\n"
                )
            })
        },
        # 2. INDENT ERROR — AI generates code with bad indentation
        {
            "type": "INDENT_ERROR",
            "response_text": json.dumps({
                "code": f"        def {base_name}_main():\n            return True\n",
                "test": f"        def test_{base_name}():\n            assert True\n"
            })
        },
        # 3. IMPORT ERROR — AI invents non-existent imports
        {
            "type": "IMPORT_ERROR",
            "response_text": json.dumps({
                "code": f"def {base_name}_fn():\n    return 42\n",
                "test": (
                    f"from {base_name}_engine import {base_name.title()}Engine\n"
                    f"def test_{base_name}():\n"
                    f"    engine = {base_name.title()}Engine()\n"
                    f"    assert engine is not None\n"
                )
            })
        },
        # 4. SYNTAX ERROR — malformed code
        {
            "type": "SYNTAX_ERROR",
            "response_text": json.dumps({
                "code": f"def {base_name}_main(:\n    return True\n",
                "test": f"def test_{base_name}():\n    assert True\n"
            })
        },
        # 5. MARKDOWN FENCES — AI wraps code in fences
        {
            "type": "MARKDOWN_FENCES",
            "response_text": json.dumps({
                "code": f"```python\ndef {base_name}_main():\n    return True\n```",
                "test": f"```python\ndef test_{base_name}():\n    assert True\n```"
            })
        },
        # 6. MISSING SYS.PATH — test lacks project root in path
        {
            "type": "MISSING_SYSPATH",
            "response_text": json.dumps({
                "code": f"def {base_name}_main():\n    return True\n",
                "test": (
                    f"import pytest\n"
                    f"def test_{base_name}():\n"
                    f"    assert True\n"
                )
            })
        },
        # 7. BOM + NULL BYTES — contaminated output
        {
            "type": "BOM_NULL",
            "response_text": json.dumps({
                "code": f"\ufeffdef {base_name}_main():\n    return True\x00\n",
                "test": f"\ufeffdef test_{base_name}():\n    assert True\n"
            })
        },
        # 8. TABS — mixed indentation
        {
            "type": "TABS",
            "response_text": json.dumps({
                "code": f"def {base_name}_main():\n\treturn True\n",
                "test": f"def test_{base_name}():\n\tassert True\n"
            })
        },
    ]
    return responses


# ==============================================================================
# HARNESS ENGINE
# ==============================================================================


class RavensHarness:
    """Runs N iterations of the Gauntlet pipeline with mock/synthetic responses."""

    def __init__(self, iterations: int, dry_run: bool = False):
        self.iterations = iterations
        self.dry_run = dry_run
        self.results = []
        self.mock_responses = load_mock_responses()

    def run(self):
        """Execute the harness."""
        print(f"\n{'='*60}")
        print(f"  RAVENS HARNESS — {self.iterations} iterations")
        print(f"  Mock responses loaded: {len(self.mock_responses)}")
        print(f"  Dry run: {self.dry_run}")
        print(f"{'='*60}\n")

        # Get real targets from the codebase
        targets = self._get_real_targets()
        if not targets:
            print("[HARNESS] No targets found. Exiting.")
            return

        print(f"[HARNESS] Found {len(targets)} real breach targets\n")

        for i in range(self.iterations):
            target = targets[i % len(targets)]
            target_file = target.get("file", "unknown")

            print(f"--- Iteration {i+1}/{self.iterations}: {target_file} ---")

            # Get responses for this target
            if self.mock_responses:
                # Use harvested responses if available
                response_idx = i % len(self.mock_responses)
                response_data = self.mock_responses[response_idx]
                response_text = response_data.get("response_text", "")
                response_type = "HARVESTED"
            else:
                # Use synthetic responses
                synthetics = generate_synthetic_responses(target_file)
                synth_idx = i % len(synthetics)
                synth = synthetics[synth_idx]
                response_text = synth["response_text"]
                response_type = synth["type"]

            # Run through the sanitizer pipeline
            result = self._run_sanitizer_pipeline(target, response_text, response_type)
            result["iteration"] = i + 1
            self.results.append(result)

            # Print status
            status = "✅ PASS" if result["passed"] else f"❌ FAIL [{result['failure_class']}]"
            print(f"  {status}")

        # Save results
        self._save_results()
        self._print_summary()

    def _get_real_targets(self) -> list[dict]:
        """Scan the real codebase for breach targets."""
        heimdall = HeimdallWarden(PROJECT_ROOT)
        heimdall.scan()

        targets = []
        for breach in heimdall.breaches:
            targets.append({
                "file": breach["file"],
                "action": breach.get("action", "Fix"),
                "type": breach.get("type", "UNKNOWN"),
            })

        # Also scan with other wardens
        wardens = [
            ("VALKYRIE", ValkyrieWarden),
            ("MIMIR", MimirWarden),
            ("EDDA", EddaWarden),
            ("RUNECASTER", RuneCasterWarden),
        ]

        for name, warden_cls in wardens:
            try:
                warden = warden_cls(PROJECT_ROOT)
                warden_targets = warden.scan()
                for t in warden_targets[:5]:  # Cap per warden
                    targets.append({
                        "file": t.get("file", "unknown"),
                        "action": t.get("action", "Fix"),
                        "type": name,
                    })
            except Exception as e:
                print(f"[HARNESS] {name} scan failed: {e}")

        return targets

    def _run_sanitizer_pipeline(self, target: dict, response_text: str, response_type: str) -> dict:
        """
        Run a single response through the full Bifrost sanitizer pipeline.
        Returns a structured result dict.
        """
        result = {
            "target_file": target["file"],
            "target_type": target.get("type", "UNKNOWN"),
            "response_type": response_type,
            "passed": False,
            "failure_class": "NONE",
            "failure_detail": "",
            "sanitizer_actions": [],
        }

        # Parse JSON response
        try:
            data = json.loads(response_text)
            code_content = data.get("code", "")
            test_content = data.get("test", "")
        except (json.JSONDecodeError, TypeError) as e:
            result["failure_class"] = "JSON_PARSE"
            result["failure_detail"] = str(e)
            return result

        if not code_content or not test_content:
            result["failure_class"] = "EMPTY_CONTENT"
            result["failure_detail"] = "Missing code or test field"
            return result

        # ===== BIFROST GATE =====

        # 1. Sanitize code
        original_code = code_content
        code_content = sanitize_code(code_content)
        if code_content != original_code:
            result["sanitizer_actions"].append("SANITIZE_CODE")

        # 2. Sanitize test
        original_test = test_content
        test_content = sanitize_test(test_content, target["file"], PROJECT_ROOT)
        if test_content != original_test:
            result["sanitizer_actions"].append("SANITIZE_TEST")

        # 3. Validate code syntax
        code_ok, code_err = validate_syntax(code_content)
        if not code_ok:
            result["failure_class"] = classify_error(code_err)
            result["failure_detail"] = f"Code: {code_err}"
            result["sanitizer_actions"].append(f"REJECTED_CODE: {code_err}")
            return result

        # 4. Validate test syntax
        test_ok, test_err = validate_syntax(test_content)
        if not test_ok:
            result["failure_class"] = classify_error(test_err)
            result["failure_detail"] = f"Test: {test_err}"
            result["sanitizer_actions"].append(f"REJECTED_TEST: {test_err}")
            return result

        # 5. Validate imports — repair if possible
        bad_imports = validate_imports(test_content, PROJECT_ROOT)
        if bad_imports:
            result["sanitizer_actions"].append(f"REPAIR_IMPORTS: {bad_imports}")
            test_content = repair_imports(test_content, PROJECT_ROOT)
            # Re-validate after repair
            remaining_bad = validate_imports(test_content, PROJECT_ROOT)
            if remaining_bad:
                result["failure_class"] = "IMPORT"
                result["failure_detail"] = "; ".join(remaining_bad[:3])
                result["sanitizer_actions"].append(f"REPAIR_FAILED: {remaining_bad}")
                return result
            # Re-validate syntax after repair (mock import added)
            test_ok2, test_err2 = validate_syntax(test_content)
            if not test_ok2:
                result["failure_class"] = classify_error(test_err2)
                result["failure_detail"] = f"Post-repair: {test_err2}"
                return result

        # In dry-run mode, we skip actual pytest execution
        if self.dry_run:
            result["passed"] = True
            result["failure_class"] = "NONE"
            result["sanitizer_actions"].append("DRYRUN_PASS")
            return result

        # 6. Write to temp and run pytest
        import tempfile
        import subprocess

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            code_path = tmp_path / Path(target["file"]).name
            test_path = tmp_path / "test_temp_harness.py"

            code_path.write_text(code_content, encoding="utf-8")
            test_path.write_text(test_content, encoding="utf-8")

            env = os.environ.copy()
            env["PYTHONPATH"] = str(PROJECT_ROOT)
            env["PYTHONIOENCODING"] = "utf-8"

            try:
                proc = subprocess.run(
                    [sys.executable, "-m", "pytest", str(test_path), "-v", "--tb=short"],
                    cwd=tmp_dir,
                    env=env,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=30,
                )

                if proc.returncode == 0:
                    result["passed"] = True
                    result["failure_class"] = "NONE"
                else:
                    error_output = proc.stdout + proc.stderr
                    result["failure_class"] = classify_error(error_output)
                    result["failure_detail"] = extract_error_summary(error_output)

            except subprocess.TimeoutExpired:
                result["failure_class"] = "TIMEOUT"
                result["failure_detail"] = "Test execution timed out (30s)"
            except Exception as e:
                result["failure_class"] = "EXECUTION"
                result["failure_detail"] = str(e)

        return result

    def _save_results(self):
        """Save results to JSON."""
        summary = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "total_iterations": self.iterations,
            "dry_run": self.dry_run,
            "passed": sum(1 for r in self.results if r["passed"]),
            "failed": sum(1 for r in self.results if not r["passed"]),
            "failure_breakdown": {},
            "results": self.results,
        }

        # Count failure classes
        for r in self.results:
            if not r["passed"]:
                cls = r["failure_class"]
                summary["failure_breakdown"][cls] = summary["failure_breakdown"].get(cls, 0) + 1

        RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(RESULTS_FILE, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)

        print(f"\n[HARNESS] Results saved to {RESULTS_FILE}")

    def _print_summary(self):
        """Print a human-readable summary."""
        passed = sum(1 for r in self.results if r["passed"])
        failed = len(self.results) - passed
        total = len(self.results)

        print(f"\n{'='*60}")
        print(f"  RAVENS HARNESS REPORT")
        print(f"{'='*60}")
        print(f"  Total:  {total}")
        print(f"  Passed: {passed} ({100*passed//total if total else 0}%)")
        print(f"  Failed: {failed}")
        print()

        if failed:
            print("  Failure Breakdown:")
            counter: dict[str, int] = {}
            for r in self.results:
                if not r["passed"]:
                    cls = r["failure_class"]
                    counter[cls] = counter.get(cls, 0) + 1

            for cls, count in sorted(counter.items(), key=lambda x: -x[1]):
                print(f"    {cls}: {count} ({100*count//failed}%)")

        # Top failing files
        file_fails: dict[str, int] = {}
        for r in self.results:
            if not r["passed"]:
                f = r["target_file"]
                file_fails[f] = file_fails.get(f, 0) + 1

        if file_fails:
            print("\n  Top Failing Files:")
            for f, count in sorted(file_fails.items(), key=lambda x: -x[1])[:5]:
                print(f"    {f}: {count} failures")

        # Sanitizer effectiveness
        sanitizer_saves = sum(
            1 for r in self.results
            if r["passed"] and any("SANITIZE" in a for a in r["sanitizer_actions"])
        )
        if sanitizer_saves:
            print(f"\n  Sanitizer Saves: {sanitizer_saves} (passed only after sanitization)")

        print(f"{'='*60}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ravens Harness - Mock-based Gauntlet testing")
    parser.add_argument("--iterations", type=int, default=100, help="Number of iterations")
    parser.add_argument("--dry-run", action="store_true", help="Skip actual pytest execution")
    args = parser.parse_args()

    harness = RavensHarness(iterations=args.iterations, dry_run=args.dry_run)
    harness.run()
