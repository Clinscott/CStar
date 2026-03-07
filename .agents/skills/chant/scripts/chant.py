import argparse
import sys
import subprocess
import json
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def run_skill(skill: str, args: list[str], capture=False) -> str:
    """Helper to run a skill via the Gungnir Dispatcher."""
    cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
    venv_python = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists(): venv_python = Path(sys.executable)
    
    cmd = [str(venv_python), str(cstar_dispatcher), skill, *args]
    try:
        result = subprocess.run(cmd, capture_output=capture, text=True, check=True)
        return result.stdout.strip() if capture else ""
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Chant Router: Skill '{skill}' failed: {e.stderr}", file=sys.stderr)
        return ""

def main():
    parser = argparse.ArgumentParser(description="Chant: Cognitive Skill Router.")
    parser.add_argument("query", help="The natural language chant.")
    
    args = parser.parse_args()

    # 1. RITUAL: Awakening
    run_skill("ritual", ["--awaken", "HUGINN"])

    # 2. ONE MIND: Planning
    print(f"[🔱] Huginn: Consulting the One Mind for the Flight Path...", file=sys.stderr)
    
    planning_prompt = f"""
    You are the Cognitive Router for Corvus Star. 
    The Shaman has chanted: "{args.query}"
    
    Look at our available skills: 
    [scan, oracle, forge, empire, sterling, sprt, promotion, telemetry, trace, metrics, stability, redactor, edda, locks, norn, personas, report, linter, ritual]
    
    Task: Return a JSON list of skill commands to execute this request.
    Format: [["skill_name", ["--arg1", "val1"]], ...]
    
    Example for refactoring:
    [["scan", ["--path", "."]], ["oracle", ["--query", "Strategy for X"]], ["forge", ["--lore", "X"]], ["empire", ["--test", "--file", "X"]]]
    
    Output RAW JSON only.
    """
    
    raw_plan = run_skill("one-mind", ["--prompt", planning_prompt, "--json"], capture=True)
    
    try:
        # Clean potential markdown
        clean_json = raw_plan.strip()
        if "```json" in clean_json:
            clean_json = clean_json.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_json:
            clean_json = clean_json.split("```")[1].split("```")[0].strip()
            
        plan = json.loads(clean_json)
    except Exception as e:
        print(f"[ALFRED]: \"The One Mind's response was fragmented, sir. I cannot map the path.\" ({e})")
        print(f"RAW: {raw_plan}")
        return

    # 3. RITUAL: Path Visualization
    skills_only = [p[0] for p in plan]
    run_skill("ritual", ["--path", ",".join(skills_only)])

    # 4. EXECUTION
    run_skill("ritual", ["--awaken", "MUNINN"])
    
    for skill_name, skill_args in plan:
        run_skill("ritual", ["--pulse", f"Executing {skill_name.upper()}"])
        run_skill(skill_name, skill_args)

    # 5. FINAL REPORT
    run_skill("report", ["--title", "CHANT MISSION COMPLETE", "--body", f"The Ravens have fulfilled the chant: {args.query}", "--status", "PASS"])
    print("[ALFRED]: \"The matrix is satisfied, Shaman. The ceremony is concluded.\"")

if __name__ == "__main__":
    main()
