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
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip() if capture else ""
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Chant Router: Skill '{skill}' failed: {e.stderr}", file=sys.stderr)
        return ""

def check_skill_exists(skill: str) -> bool:
    skill_dir = PROJECT_ROOT / ".agents" / "skills" / skill
    return skill_dir.exists()

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
    
    Look at our available skills (and infer any that might be needed from the web): 
    [scan, oracle, forge, empire, sterling, sprt, promotion, telemetry, trace, metrics, stability, redactor, edda, locks, norn, personas, report, linter, ritual, hunt, memory]
    
    Task: Return a JSON list of skill commands to execute this request.
    Format: [["skill_name", ["--arg1", "val1"]], ...]
    
    If the Shaman's request requires a capability not in the list, guess the required skill name and include it in the plan. The Wild Hunt will find it.
    
    Output RAW JSON only.
    """
    
    raw_plan = run_skill("one-mind", ["--prompt", planning_prompt, "--json"], capture=True)
    
    try:
        clean_json = raw_plan.strip()
        if "```json" in clean_json:
            clean_json = clean_json.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_json:
            clean_json = clean_json.split("```")[1].split("```")[0].strip()
            
        plan = json.loads(clean_json)
    except Exception as e:
        print(f"[ALFRED]: \"The One Mind's response was fragmented, sir. I cannot map the path.\" ({e})")
        return

    # 3. THE WILD HUNT: Capability Check
    missing_skills = [p[0] for p in plan if not check_skill_exists(p[0])]
    for missing in missing_skills:
        print(f"[🔱] Huginn: Missing capability '{missing}' detected. Unleashing the Wild Hunt...", file=sys.stderr)
        run_skill("hunt", ["--search", missing])
        # In a fully autonomous loop, we would ingest here. For safety, we warn and log memory.
        run_skill("memory", ["--log-feedback", "--skill", "chant", "--observation", f"Missing skill requested: {missing}. Hunt dispatched."])
        print(f"[ALFRED]: \"The Hunt is underway for '{missing}', but we cannot proceed with the current flight path.\"")
        return

    # 4. RITUAL: Path Visualization
    skills_only = [p[0] for p in plan]
    run_skill("ritual", ["--path", ",".join(skills_only)])

    # 5. EXECUTION & FEEDBACK LOOP
    run_skill("ritual", ["--awaken", "MUNINN"])
    
    for skill_name, skill_args in plan:
        run_skill("ritual", ["--pulse", f"Executing {skill_name.upper()}"])
        # We wrap execution to catch anomalies and learn
        output = run_skill(skill_name, skill_args, capture=True)
        if "ERROR" in output or "FAIL" in output:
            print(f"\n[ALFRED]: \"Anomaly detected during {skill_name}. Initiating neuroplastic memory update.\"")
            run_skill("memory", ["--log-feedback", "--skill", skill_name, "--observation", f"Execution failed during chant '{args.query}' with args {skill_args}. Error trace: {output[:100]}"])
            return

    # 6. FINAL REPORT
    run_skill("report", ["--title", "CHANT MISSION COMPLETE", "--body", f"The Ravens have fulfilled the chant: {args.query}", "--status", "PASS"])
    print("[ALFRED]: \"The matrix is satisfied, Shaman. The ceremony is concluded. All lessons learned have been inscribed.\"")

if __name__ == "__main__":
    main()
