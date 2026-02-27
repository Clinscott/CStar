#!/usr/bin/env python3
"""
[ALFRED] The Utility Belt
Identity: ALFRED
Purpose: Refactoring Forge & Crucible Verification.

Targets highly complex functions.
Uses the Antigravity Bridge to request an exact logical equivalent that is broken down, type-hinted, and docstring-commented.
Mandates that pytest passes on the newly refactored code before committing.
Mandates human-in-the-loop (diff review) before committing refactored code to the manor.
"""

import argparse
import asyncio
import json
import logging
import subprocess
import sys
from pathlib import Path

# Ensure UTF-8 output for box-drawing characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8')

project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.sovereign_hud import SovereignHUD
from src.cstar.core.uplink import query_bridge

# Configure Logging
logging.basicConfig(
    filename=str(project_root / "sovereign_activity.log"),
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

class UtilityBelt:
    """Automated Refactoring with Crucible Verification and Human Oversight."""

    def __init__(self, target: str, max_retries: int = 3):
        self.target_path = Path(target).resolve()
        self.max_retries = max_retries

        # Enforce ALFRED persona
        SovereignHUD.PERSONA = "ALFRED"

    async def _refactor_code(self, file_path: Path) -> str | None:
        """Queries the bridge to refactor the code."""
        if not file_path.exists():
            SovereignHUD.persona_log("ERROR", f"Target file not found: {file_path}")
            return None

        code_content = file_path.read_text(encoding="utf-8")

        prompt = f"""
[CRITICAL INSTRUCTION]
You are ALFRED, the elegant refactoring engine for the Corvus Star Manor.
Your task is to refactor the following Python file for extreme elegance, readability, and the Linscott Standard.

TARGET FILE ({file_path.name}):
```python
{code_content}
```

[MANDATORY REFACTORING CONSTRAINTS]
1. DO NOT alter the underlying logic or public API signatures. This code MUST pass its existing test suite.
2. Break down highly complex (cyclomatic complexity > C) functions into smaller, private helper functions.
3. Enforce rigorous Type Hints (e.g., `list[str]`, `dict[str, Any]`, `Optional[int]`).
4. Weave in missing Google-style Docstrings for all classes and functions.
5. Output ONLY the raw, complete Python code for the refactored file. No markdown formatting, no explanations.
6. Do not remove necessary imports.

Commence the refinement.
"""
        context = {
            "persona": "ALFRED",
            "target_interface": str(file_path)
        }

        SovereignHUD.persona_log("INFO", f"Bridging to Forge for refinement of {file_path.name}...")

        for attempt in range(self.max_retries):
            try:
                response = await query_bridge(prompt, context)
                if response and response.get("status") == "success":
                    data = response.get("data", {})

                    if isinstance(data, dict):
                         if "code" in data:
                             code = data["code"]
                         elif "raw" in data:
                             code = data["raw"]
                         else:
                             code = json.dumps(data)
                    else:
                        code = str(data)

                    return self._clean_markdown(code)

            except Exception as e:
                SovereignHUD.persona_log("WARN", f"Forge attempt {attempt+1} failed: {e}")
                await asyncio.sleep(2)

        SovereignHUD.persona_log("ERROR", "Max retries exceeded for refactoring.")
        return None

    def _clean_markdown(self, text: str) -> str:
        """Strips markdown code blocks."""
        text = text.strip()
        if text.startswith("```python"):
            text = text[9:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip() + "\n"

    def _verify_crucible(self, target_file: Path, refactored_code: str) -> bool:
        """Runs the test suite against the refactored code in a temporary environment."""
        SovereignHUD.persona_log("INFO", "Initializing The Crucible (Verification Phase)...")

        # Determine the test file name heuristically based on conventions
        test_filename = f"test_{target_file.name}"
        test_filepath = None

        search_dirs = [
            project_root / "tests",
            project_root / "tests" / "unit",
            project_root / "tests" / "integration",
            project_root / "tests" / "empire_tests"
        ]

        for sd in search_dirs:
            potential_path = sd / test_filename
            if potential_path.exists():
                test_filepath = potential_path
                break

        if not test_filepath:
            SovereignHUD.persona_log("WARN", "CRUCIBLE ABORT: No corresponding test file found. Refactoring cannot proceed safely.")
            return False

        # We must test the refactored code without permanently destroying the original file.
        # Approach: Backup original -> Write new -> Run Pytest -> Restore original

        backup_code = target_file.read_text(encoding="utf-8")
        crucible_passed = False

        try:
            # Inject
            target_file.write_text(refactored_code, encoding="utf-8")

            # Execute Pytest specifically on the target's test file
            cmd = [sys.executable, "-m", "pytest", str(test_filepath), "-q", "--tb=short"]
            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                SovereignHUD.persona_log("SUCCESS", "CRUCIBLE PASSED: Logic integrity maintained.")
                crucible_passed = True
            else:
                 SovereignHUD.persona_log("FAIL", "CRUCIBLE FAILED: Refactoring broke the logic.")
                 # Print a snippet of the failure
                 SovereignHUD.box_separator()
                 SovereignHUD.box_row("TEST FAILURE", result.stdout[:200].replace('\n', ' ') + "...", SovereignHUD.RED)
                 SovereignHUD.box_separator()

        finally:
            # Always restore the original immediately during verification
            target_file.write_text(backup_code, encoding="utf-8")

        return crucible_passed

    def _human_review(self, target_file: Path, refactored_code: str) -> bool:
        """Presents the refactored code to the user for diff review."""
        SovereignHUD.box_separator()
        SovereignHUD.box_row("HUMAN IN THE LOOP", "REVIEW REQUIRED", SovereignHUD.YELLOW)
        SovereignHUD.box_row("TARGET", target_file.name, SovereignHUD.CYAN)
        SovereignHUD.box_separator()

        lines = refactored_code.splitlines()
        preview_lines = lines[:15]
        for line in preview_lines:
             SovereignHUD.box_row("  ", line, SovereignHUD.CYAN, dim_label=True)

        if len(lines) > 15:
             SovereignHUD.box_row("  ", f"... (+ {len(lines)-15} more lines)", SovereignHUD.CYAN, dim_label=True)

        SovereignHUD.box_separator()
        try:
             ans = input(f"{SovereignHUD.get_theme()['main']}[ALFRED] Sir, the forge glow subsides. Shall I commit this refinement to the main branch? (y/N): {SovereignHUD.RESET}")
             return ans.strip().lower() in ['y', 'yes']
        except (KeyboardInterrupt, EOFError):
             return False

    def _commit_refactor(self, target_file: Path, refactored_code: str) -> bool:
        """Writes the approved refactored code strictly over the original file."""
        try:
             target_file.write_text(refactored_code, encoding="utf-8")
             SovereignHUD.persona_log("SUCCESS", f"Committed refinement to: {target_file.relative_to(project_root)}")
             return True
        except Exception as e:
             SovereignHUD.persona_log("ERROR", f"Failed to commit {target_file.name}: {e}")
             return False

    async def execute(self) -> None:
        """Main execution sequence."""
        SovereignHUD.box_top("[A] THE UTILITY BELT")
        SovereignHUD.box_row("DIRECTIVE", "ELEGANCE & REFACTORING", SovereignHUD.CYAN)
        SovereignHUD.box_row("TARGET", str(self.target_path), SovereignHUD.YELLOW)

        if not self.target_path.exists() or not self.target_path.is_file():
            SovereignHUD.box_row("STATUS", "Invalid target file.", SovereignHUD.RED)
            SovereignHUD.box_bottom()
            return

        SovereignHUD.box_separator()
        SovereignHUD.persona_log("INFO", "Initializing Forge sequence...")

        refactored_code = await self._refactor_code(self.target_path)

        if not refactored_code:
            SovereignHUD.box_row("RESULT", "Refactoring Failed. Check Bridge logs.", SovereignHUD.RED)
            SovereignHUD.box_bottom()
            return

        secure = self._verify_crucible(self.target_path, refactored_code)

        if not secure:
             SovereignHUD.box_row("RESULT", "Refactoring discarded due to test failure.", SovereignHUD.RED)
             SovereignHUD.box_bottom()
             return

        approved = self._human_review(self.target_path, refactored_code)

        if approved:
            self._commit_refactor(self.target_path, refactored_code)
        else:
            SovereignHUD.persona_log("INFO", "Refinement rejected by user. Discarding trace.")

        SovereignHUD.box_bottom()

def main() -> int | None:
    parser = argparse.ArgumentParser(description="The Utility Belt - Refactoring Forge")
    parser.add_argument("target", help="File to refactor")
    args = parser.parse_args()

    belt = UtilityBelt(target=args.target)
    try:
        asyncio.run(belt.execute())
        return 0
    except KeyboardInterrupt:
        SovereignHUD.persona_log("WARN", "Utility Belt protocol aborted.")
        return 1
    except Exception as e:
        SovereignHUD.persona_log("ERROR", f"Utility Belt protocol failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
