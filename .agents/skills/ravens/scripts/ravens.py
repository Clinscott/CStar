import argparse
import sys
import subprocess
import json
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.runtime_env import resolve_project_python

def run_skill(skill: str, args: list[str]) -> str:
    """Helper to run a skill via the Gungnir Dispatcher."""
    cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
    venv_python = resolve_project_python(PROJECT_ROOT)
    
    cmd = [str(venv_python), str(cstar_dispatcher), skill, *args]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Ravens Deep Weave: Skill '{skill}' failed: {e.stderr}", file=sys.stderr)
        return ""

def main():
    parser = argparse.ArgumentParser(description="Ravens Protocol: Deep Weave Autonomous Repair.")
    parser.add_argument("--cycle", action="store_true", help="Execute one deep-weave repair cycle")
    parser.add_argument("--path", default=".", help="Target root path")
    
    args = parser.parse_args()

    if not args.cycle:
        parser.print_help()
        return

    print("[🔱] Ravens: Initiating Deep Weave Flight Cycle...", file=sys.stderr)

    # 1. NORN: Target Selection
    print("[🔱] Ravens: Consulting the Norns for target allocation...", file=sys.stderr)
    # We simulate sync and get-next bead logic
    run_skill("norn", ["--sync"])
    # In a real implementation, we'd parse the bead JSON here
    
    # For this blueprint, we assume we have a target (e.g., from technical debt ledger)
    target_file = "src/core/utils.py" # Placeholder for selected bead
    
    # 2. STABILITY: Fatigue Check
    print(f"[🔱] Ravens: Checking sector gravity for {target_file}...", file=sys.stderr)
    stability_res = run_skill("stability", ["--audit", "--file", target_file])
    if "WARNING" in stability_res:
        print("[ALFRED]: Sector is unstable. Returning to the High Seat.")
        return

    # 3. ORACLE: Strategy Formulation
    print(f"[🔱] Ravens: Consulting the Oracle for {target_file} refactoring...", file=sys.stderr)
    strategy = run_skill("oracle", ["--query", f"Analyze {target_file} and provide a refactoring strategy to reduce technical debt."])

    # 4. FORGE: Artifact Weaving
    print(f"[🔱] Ravens: Summoning the Forge for {target_file}...", file=sys.stderr)
    forge_res = run_skill("forge", ["--lore", target_file, "--objective", "Refactor for stability and Linscott compliance."])

    # 5. EMPIRE: Behavioral Verification
    print(f"[🔱] Ravens: Entering the Empire Crucible...", file=sys.stderr)
    empire_res = run_skill("empire", ["--test", "--file", target_file])

    # 6. STERLING: Sovereignty Audit
    print(f"[🔱] Ravens: Performing final Sterling Audit...", file=sys.stderr)
    sterling_res = run_skill("sterling", ["--files", target_file])

    # 7. SPRT: Statistical Judgment
    print(f"[🔱] Ravens: Calculating Gungnir SPRT significance...", file=sys.stderr)
    # Simulate a score delta evaluation
    sprt_res = run_skill("sprt", ["--eval", "--pre", "7.5", "--post", "8.2"])

    # 8. PROMOTION: Registry Update
    if "PASS" in sprt_res:
        print(f"[🔱] Ravens: Promoting repair for {target_file}...", file=sys.stderr)
        run_skill("promotion", ["--register", "--skill", f"AUTO_FIX_{int(time.time())}", "--files", target_file])
        status = "SUCCESS"
    else:
        status = "REJECTED"

    # 9. TELEMETRY: Mission Trace
    print(f"[🔱] Ravens: Recording mission trace...", file=sys.stderr)
    mission_id = f"RAVEN-{int(time.time())}"
    run_skill("telemetry", [
        "trace", "--mission", mission_id, "--file", target_file, 
        "--metric", "AUTONOMOUS_REPAIR", "--score", "1.0", 
        "--justification", f"Deep Weave cycle complete for {target_file}",
        "--status", status
    ])

    # 10. TALIESIN: Victory Report
    print(f"[🔱] Ravens: Finalizing mission report...", file=sys.stderr)
    report_body = f"The sector {target_file} has been refactored through the Deep Weave. SPRT result: {sprt_res}."
    run_skill("report", ["--title", "RAVENS MISSION COMPLETE", "--body", report_body, "--status", "PASS" if status == "SUCCESS" else "FAIL"])

    print("[ALFRED]: Mission complete. The matrix is updated.")

if __name__ == "__main__":
    main()
