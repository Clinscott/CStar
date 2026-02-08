"""
Sovereign Fish: The Autonomous Improver
Identity: ODIN/ALFRED Hybrid
Purpose: Execute the Sovereign Fish Protocol autonomously.
"""

import os
import sys
import json
import re
import time
import shutil
import logging
import subprocess
import google.generativeai as genai
from pathlib import Path
from colorama import Fore, Style, init

# Initialize Colorama
init(autoreset=True)

# Add .agent/scripts to path to import annex
sys.path.append(os.path.join(os.path.dirname(__file__), ".agent", "scripts"))

try:
    from annex import AnnexStrategist
    from ui import HUD
except ImportError:
    # Fallback if running outside of expected structure
    print(f"{Fore.RED}[CRITICAL] Could not import AnnexStrategist. Ensure .agent/scripts is accessible.")
    sys.exit(1)

# Configure Logging
logging.basicConfig(
    filename="sovereign_activity.log",
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)


class CampaignStrategist:
    """
    Parses CAMPAIGN_IMPLEMENTATION_PLAN.qmd to find the next actionable task.
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
            # Simpler: Just wrap the whole line content (excluding outer pipes) in ~~
            # Or regex replace content. 
            # Safe strategy: Replace "| content |" with "| ~~content~~ |"
            # But naive approach: just wrap the inner text of columns? 
            # Easiest: Wrap the Description column? 
            # Standard markdown strikethrough for whole row usually requires striking each cell or the whole line.
            # Let's strike the Description column to indicate done.
            
            # Reconstruct the line with struck description
            # This is complex with regex. 
            # Alternative: Prepend `~~` and append `~~` to the Description field.
            
            parts = line.split("|")
            # Index 0 is empty (before first pipe), 1 is ID, 2 is File, 3 is Target, 4 is Type, 5 is Description
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


# ==============================================================================
# 🛡️ THE LORE STRATEGISTS
# ==============================================================================

class ValkyrieStrategist:
    """
    [DEAD CODE PRUNING]
    Lore: "Choosers of the Slain."
    Purpose: Idenitfy unused imports and unreachable code.
    """
    def __init__(self, root: Path):
        self.root = root
        
    def scan(self) -> list:
        # Placeholder for Vulture integration
        return []

class EddaStrategist:
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
            if "node_modules" in py_file.parts or ".venv" in py_file.parts: continue
            
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
            except: pass
        return targets

class RuneCasterStrategist:
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
            if "node_modules" in py_file.parts or ".venv" in py_file.parts: continue
            
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
            except: pass
        return targets

class TorvaldsStrategist:
    """
    [COMPLEXITY]
    Lore: "The Standard of Excellence."
    Purpose: Identify cyclomatic complexity > 10.
    """
    def __init__(self, root: Path):
        self.root = root
        
    def scan(self) -> list:
        # Placeholder for Radon/McCabe check
        return []

class VisualStrategist:
    """
    Hunts for "Beauty" improvements (Form).
    Target: Buttons without hover states, inconsistent spacing, etc.
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
                
            content = tsx_file.read_text(encoding='utf-8')
            # Regex for <button ... className="..." ...> that lacks 'hover:'
            # Simple heuristic
            lines = content.splitlines()
            for i, line in enumerate(lines):
                if "<button" in line and "className" in line and "hover:" not in line:
                    targets.append({
                        "type": "BEAUTY_BREACH",
                        "file": str(tsx_file.relative_to(self.root)),
                        "action": f"Add hover state to button at line {i+1}",
                        "line": i+1,
                        "severity": "MEDIUM" # Form is important but not Critical
                    })
                    
        return targets



class SovereignFish:
    def __init__(self, target_path: str):
        self.root = Path(target_path).resolve()
        self.api_key = os.getenv("GOOGLE_API_KEY")
        
        # NOTE: HUD.PERSONA is set by main_loop.py or defaults to ALFRED in ui.py
        # We assume it's set correctly or we could reload it here if run standalone.
        # But for "The One Voice" pattern, we rely on the global HUD state.
        
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY environment variable not set.")
            
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    def run(self) -> bool:
        """
        Executes one cycle of the Sovereign Fish Protocol.
        Returns True if a change was made and verified, False otherwise.
        """
        # Determine Voice for logging
        if HUD.PERSONA == "ALFRED":
            HUD.persona_log("INFO", f"Swimming in {self.root}...")
        else:
            HUD.persona_log("INFO", f"The Hunter enters {self.root}...")
        
        # 1. SCAN (The Hunt)
        # A. Check for Breaches (Annex) - FUNCTION (Code) & FORM (Docs/Tests)
        strategist = AnnexStrategist(self.root)
        strategist.scan()
        
        # B. Check for Imperfections - BEAUTY (Visuals)
        beauty_expert = VisualStrategist(self.root)
        beauty_targets = beauty_expert.scan()
        
        # C. Check for Saga Gaps - EDDA (Docs)
        edda = EddaStrategist(self.root)
        edda_targets = edda.scan()
        
        # D. Check for Runes - RUNECASTER (Types)
        rune = RuneCasterStrategist(self.root)
        rune_targets = rune.scan()
        
        # E. Check for Weakness - TORVALDS (Complexity)
        torvalds = TorvaldsStrategist(self.root)
        torvalds_targets = torvalds.scan()

        target = None
        
        # Priority Logic:
        # 1. Critical Code/Test Breaches (Annex)
        if strategist.breaches:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("WARN", "Critical issues detected. Attending to them immediately.")
            else:
                HUD.persona_log("WARN", "Weakness detected. The walls must be reinforced.")
            target = self._select_breach_target(strategist.breaches)
            
        # 2. Beauty Imperfections (VisualStrategist)
        if not target and beauty_targets:
             if HUD.PERSONA == "ALFRED":
                 HUD.persona_log("INFO", "The presentation is a bit untidy. polishing.")
             else:
                 HUD.persona_log("INFO", "Form is function. The visual runes are misaligned.")
             target = beauty_targets[0]
             
        # 3. Saga Gaps (Edda)
        if not target and edda_targets:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("INFO", "Some records are missing. Updating the Archive.")
            else:
                HUD.persona_log("INFO", "The Saga is incomplete. Weaving the Edda.")
            target = edda_targets[0]
            
        # 4. Rune Gaps (RuneCaster)
        if not target and rune_targets:
             if HUD.PERSONA == "ALFRED":
                 HUD.persona_log("INFO", "Labeling the new inventory items.")
             else:
                 HUD.persona_log("INFO", "The Runes are undefined. Casting strict definitions.")
             target = rune_targets[0]

        # 5. Campaign (Mandate)
        if not target:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("INFO", "No immediate concerns. Checking your itinerary...")
            else:
                HUD.persona_log("INFO", "The realm is secure. Consulting the Great Plan...")
                
            campaign = CampaignStrategist(self.root)
            target = campaign.get_next_target()
            if target:
                target['source'] = 'CAMPAIGN'
                
        if not target:
            if HUD.PERSONA == "ALFRED":
                HUD.persona_log("SUCCESS", "Everything appears to be in order, sir.")
            else:
                HUD.persona_log("SUCCESS", "The waters are clear. Heimdall sees no threats.")
            return False

            
        HUD.persona_log("WARN", f"Target: {target['action']} in {target['file']}")
        logging.info(f"[{self.root.name}] [TARGET] {target['action']} ({target['file']})")

        
        # 3. FORGE (Execute Fix)
        if not self._forge_improvement(target):
            return False
            
        # 4. CRUCIBLE (Verify)
        if self._verify_fix(target):
            logging.info(f"[{self.root.name}] [SUCCESS] Verified fix for {target['file']}")
            
            # If Campaign task, update the plan
            if target.get('source') == 'CAMPAIGN':
                CampaignStrategist(self.root).mark_complete(target)
                if HUD.PERSONA == "ALFRED":
                     HUD.persona_log("SUCCESS", "I have crossed that item off your list, sir.")
                else:
                     HUD.persona_log("SUCCESS", "The Runes are cast. Limit broken.")
                
            return True
        else:
            logging.warning(f"[{self.root.name}] [ROLLBACK] Fix failed verification.")
            return False

    def _select_breach_target(self, breaches: list) -> dict:
        """Prioritizes breaches."""
        # Priority 1: Linscott (Missing Tests)
        for b in breaches:
            if b['type'] == 'LINSCOTT_BREACH':
                return b
        
        # Priority 2: Torvalds (Code Quality)
        for b in breaches:
            if b['type'] == 'TORVALDS_BREACH':
                return b
                
        return None

    def _forge_improvement(self, target: dict) -> bool:
        """Uses Gemini to generate the fix."""
        file_path = self.root / target['file']
        
        # Context Loading
        context = ""
        if file_path.exists():
            context = file_path.read_text(encoding='utf-8')
        
        # Prompt Engineering
        prompt = f"""
        ACT AS: Senior Python Engineer (The Linscott Standard).
        TASK: {target['action']}
        FILE: {target['file']}
        
        CONTEXT:
        ```python
        {context}
        ```
        
        INSTRUCTIONS:
        1. If creating a new file (e.g., test), provide the FULL file content.
        2. If modifying, provide the FULL new content of the file.
        3. STRICTLY follow Python best practices (typing, docstrings).
        4. If writing a test, use 'pytest' and ensure it passes.
        5. OUTPUT ONLY THE CODE. No markdown fences, no conversational text.
        """
        
        try:
            HUD.persona_log("INFO", "Consulting the Oracle (Gemini)...")
            response = self.model.generate_content(prompt)
            code = response.text.replace("```python", "").replace("```", "").strip()
            
            # Backup
            if file_path.exists():
                shutil.copy(file_path, f"{file_path}.bak")
            
            # Write
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(code, encoding='utf-8')
            HUD.persona_log("SUCCESS", f"Implemented fix in {target['file']}")
            return True
            
        except Exception as e:
            HUD.persona_log("ERROR", f"Forge Error: {e}")
            logging.error(f"[{self.root.name}] [FORGE_ERROR] {e}")
            return False

    def _verify_fix(self, target: dict) -> bool:
        """Runs tests to verify the fix."""
        HUD.persona_log("INFO", "Verifying through The Crucible...")
        
        # Determine what to test
        test_target = ""
        
        # Improved Test Targeting
        target_file = Path(target['file'])
        
        if "test" in target_file.name:
             test_target = self.root / target_file
        else:
             # Try to find associated test
             test_target = self.root / "tests" / f"test_{target_file.stem}.py"
             if not test_target.exists():
                 # Fallback to general test folder
                  test_target = self.root / "tests"

        try:
            # Run pytest
            result = subprocess.run(
                ["python", "-m", "pytest", str(test_target), "-v", "--tb=short"],
                cwd=self.root,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                HUD.persona_log("PASS", "VERIFICATION PASSED.")
                # Clean backup
                file_path = self.root / target['file']
                if os.path.exists(f"{file_path}.bak"):
                    os.remove(f"{file_path}.bak")
                return True
            else:
                HUD.persona_log("FAIL", "VERIFICATION FAILED.")
                # print(result.stdout) # Optional: Log output
                # Rollback
                file_path = self.root / target['file']
                if os.path.exists(f"{file_path}.bak"):
                    HUD.persona_log("WARN", "Rolling back changes...")
                    shutil.move(f"{file_path}.bak", file_path)
                return False
                
        except Exception as e:
            HUD.persona_log("ERROR", f"Verification Error: {e}")
            return False


def run(target_path: str):
    """Entry point for the daemon."""
    try:
        fish = SovereignFish(target_path)
        return fish.run()
    except Exception as e:
        print(f"{Fore.RED}[ERROR] Agent Crash: {e}")
        logging.error(f"[{target_path}] [CRASH] {e}")
        return False

if __name__ == "__main__":
    # Test Run
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    run(target)
