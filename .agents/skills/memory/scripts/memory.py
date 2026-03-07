import argparse
import sys
import sqlite3
import subprocess
from pathlib import Path
from datetime import datetime

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def log_to_sqlite(skill: str, observation: str):
    """Log the feedback to Mimir's Well."""
    db_path = PROJECT_ROOT / ".stats" / "pennyone.db"
    if not db_path.exists():
        db_path.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS skill_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            skill TEXT,
            observation TEXT
        )
    ''')
    cursor.execute(
        "INSERT INTO skill_feedback (timestamp, skill, observation) VALUES (?, ?, ?)",
        (datetime.now().isoformat(), skill, observation)
    )
    conn.commit()
    conn.close()

def evolve_contract(skill: str, observation: str, is_root: bool = False):
    """Use the One Mind to update the skill's Gherkin contract or the root AGENTS contract."""
    if is_root:
        contract_path = PROJECT_ROOT / ".agents" / "AGENTS.feature"
        skill_name_display = "Global System (AGENTS.feature)"
        if not contract_path.exists():
            current_contract = "Feature: Global System Behaviors\n\n  Scenario: Baseline execution\n    Given the system is active\n    Then it maintains the Pact\n"
        else:
            current_contract = contract_path.read_text(encoding='utf-8')
    else:
        skill_dir = PROJECT_ROOT / ".agents" / "skills" / skill
        contract_path = skill_dir / f"{skill}.feature"
        skill_name_display = f"'{skill}' skill"
        
        if not contract_path.exists():
            # Baseline contract if it doesn't exist
            current_contract = f"Feature: {skill.capitalize()} Skill Behavior\n\n  Scenario: Baseline execution\n    Given the skill is triggered\n    Then it should perform its mandate\n"
        else:
            current_contract = contract_path.read_text(encoding='utf-8')

    cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
    venv_python = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists(): venv_python = Path(sys.executable)

    prompt = f"""
    You are the Corvus Star Memory Scribe. 
    A new observation has been witnessed for the {skill_name_display}: "{observation}"
    
    Update the following Gherkin BDD contract to include a new Scenario that codifies this learning. 
    Ensure the Gherkin syntax is perfectly valid.
    
    CURRENT CONTRACT:
    ```gherkin
    {current_contract}
    ```
    
    Output ONLY the complete, updated raw Gherkin text. No markdown wrappers.
    """

    cmd = [
        str(venv_python), str(cstar_dispatcher), "one-mind",
        "--prompt", prompt,
        "--system_prompt", "You output raw Gherkin text only."
    ]
    
    try:
        print(f"[🔱] Scribe: Weaving new neural pathways into {contract_path.name}...", file=sys.stderr)
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        raw_output = result.stdout.strip()
        
        # Clean potential markdown
        if raw_output.startswith("```gherkin"):
            raw_output = raw_output[len("```gherkin"):].strip()
        if raw_output.startswith("```"):
            raw_output = raw_output[3:].strip()
        if raw_output.endswith("```"):
            raw_output = raw_output[:-3].strip()

        contract_path.write_text(raw_output, encoding='utf-8')
        print(f"[SUCCESS] The {contract_path.name} contract has evolved.")
    except Exception as e:
         print(f"[ERROR] Failed to evolve contract: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description="Memory: Recursive Learning & Contract Evolution.")
    parser.add_argument("--log-feedback", action="store_true", help="Log an observation")
    parser.add_argument("--skill", default="system", help="Target skill name")
    parser.add_argument("--observation", required=True, help="What was witnessed or misinterpreted")
    parser.add_argument("--root", action="store_true", help="Update the global AGENTS.feature contract instead of a specific skill")
    
    args = parser.parse_args()

    if args.log_feedback:
        log_to_sqlite(args.skill, args.observation)
        evolve_contract(args.skill, args.observation, is_root=args.root)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
