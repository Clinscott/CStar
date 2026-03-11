import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path

SOURCE_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
STATE_ROOT = Path(os.environ.get("CORVUS_STATE_ROOT", str(SOURCE_ROOT)))
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from src.core.engine.hall_schema import HallOfRecords, HallSkillObservation


def _now_ms() -> int:
    return int(time.time() * 1000)


def _target_contract(skill: str, is_root: bool) -> str:
    if is_root:
        return ".agents/AGENTS.feature"
    return f".agents/skills/{skill}/{skill}.feature"


def log_feedback_observation(skill: str, observation: str, *, is_root: bool = False) -> str:
    """Record memory feedback as a Hall observation without mutating contracts."""
    hall = HallOfRecords(STATE_ROOT)
    repo = hall.bootstrap_repository()
    observation_id = f"memory:{uuid.uuid4().hex[:12]}"
    target_contract = _target_contract(skill, is_root)
    hall.save_skill_observation(
        HallSkillObservation(
            observation_id=observation_id,
            repo_id=repo.repo_id,
            skill_id="system" if is_root else skill,
            outcome="FEEDBACK_LOGGED",
            observation=observation,
            created_at=_now_ms(),
            metadata={
                "source": "memory-compatibility-surface",
                "target_contract": target_contract,
                "contract_mutation": "DISABLED",
                "canonical_promotion_path": "cstar evolve --action propose",
            },
        )
    )
    return observation_id


def evolve_contract(skill: str, observation: str, is_root: bool = False) -> str:
    """Compatibility wrapper that refuses direct contract mutation."""
    observation_id = log_feedback_observation(skill, observation, is_root=is_root)
    target_contract = _target_contract(skill, is_root)
    print(
        (
            f"[ALFRED]: Feedback logged to the Hall as {observation_id}. "
            f"Direct contract mutation for {target_contract} is retired. "
            "Create a sovereign bead and use the Hall-backed evolve proposal flow instead."
        ),
        file=sys.stderr,
    )
    return observation_id


def main():
    parser = argparse.ArgumentParser(description="Memory: compatibility feedback logging surface.")
    parser.add_argument("--log-feedback", action="store_true", help="Log an observation")
    parser.add_argument("--skill", default="system", help="Target skill name")
    parser.add_argument("--observation", required=True, help="What was witnessed or misinterpreted")
    parser.add_argument("--root", action="store_true", help="Update the global AGENTS.feature contract instead of a specific skill")

    args = parser.parse_args()

    if args.log_feedback:
        observation_id = evolve_contract(args.skill, args.observation, is_root=args.root)
        print(
            json.dumps(
                {
                    "status": "SUCCESS",
                    "observation_id": observation_id,
                    "skill_id": "system" if args.root else args.skill,
                    "contract_mutation": "DISABLED",
                    "state_root": str(STATE_ROOT).replace("\\", "/"),
                }
            )
        )
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
