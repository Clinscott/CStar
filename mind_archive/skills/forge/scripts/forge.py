import argparse
import json
import sys
import subprocess
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.forge_candidate import (
    extract_candidate_payload,
    normalize_freeform_intent_to_forge_request,
    normalize_lore_to_forge_request,
    stage_forge_candidate,
)
from src.core.runtime_env import resolve_project_python


def _to_repo_path(path: Path) -> str:
    try:
        return path.relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()

def main():
    parser = argparse.ArgumentParser(description="Taliesin Forge: Weave code from lore.")
    parser.add_argument("--lore", required=True, help="Relative path to the lore file.")
    parser.add_argument("--objective", help="Optional objective override.")
    args = parser.parse_args()

    lore_path = PROJECT_ROOT / args.lore
    if not lore_path.exists():
        print(f"[ALFRED]: CRITICAL - Lore missing at {lore_path}")
        sys.exit(1)

    if lore_path.suffix.lower() in {".py", ".ts", ".tsx", ".js", ".jsx"}:
        repo_target_path = _to_repo_path(lore_path)
        request = normalize_freeform_intent_to_forge_request(
            PROJECT_ROOT,
            args.objective or f"Materialize a validation-ready candidate for {repo_target_path}.",
            target_path=repo_target_path,
            contract_refs=[f"file:{repo_target_path}"],
            operator_constraints={"objective_override": args.objective} if args.objective else None,
        )
    else:
        request = normalize_lore_to_forge_request(
            PROJECT_ROOT,
            lore_path,
            operator_constraints={"objective_override": args.objective} if args.objective else None,
        )

    # Trigger One Mind Skill via Dispatcher
    cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
    venv_python = resolve_project_python(PROJECT_ROOT)

    print(f"[Ω] Forge: Requesting materialization from the One Mind...", file=sys.stderr)
    
    try:
        # Use 'one-mind' skill for the direct strike
        cmd = [
            str(venv_python), str(cstar_dispatcher), "one-mind",
            "--generate-code",
            "--objective", args.objective if args.objective else "Materialize the lore.",
            "--context", str(lore_path),
            "--json"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        payload = extract_candidate_payload(result.stdout)
        staged_result = stage_forge_candidate(
            PROJECT_ROOT,
            request,
            payload,
            required_validations=["crucible", "generated_tests", "gungnir_delta"],
        )

        print(f"[🔱] Artifact forged successfully: {staged_result.target_path}", file=sys.stderr)
        print(
            f"[ALFRED]: Candidate staged for review at {Path(staged_result.staged_path).relative_to(PROJECT_ROOT)}",
            file=sys.stderr,
        )
        print(json.dumps(staged_result.to_dict(), indent=2))

    except Exception as e:
        print(f"Forge failed: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
