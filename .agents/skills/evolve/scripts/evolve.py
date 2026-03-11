import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.evolve_skill import execute_evolve, execute_evolve_promotion


def main() -> None:
    parser = argparse.ArgumentParser(description="Authoritative evolve skill entrypoint.")
    parser.add_argument("--action", choices=("propose", "promote"), default="propose")
    parser.add_argument("--bead-id")
    parser.add_argument("--proposal-id")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--simulate", action="store_true")
    parser.add_argument("--focus-axis", action="append", default=[])
    parser.add_argument("--validation-profile", default="standard")
    args = parser.parse_args()

    if args.action == "promote":
        if not args.proposal_id:
            parser.error("--proposal-id is required when --action promote.")
        result = execute_evolve_promotion(
            PROJECT_ROOT,
            proposal_id=args.proposal_id,
        )
    else:
        result = execute_evolve(
            PROJECT_ROOT,
            bead_id=args.bead_id,
            dry_run=args.dry_run,
            simulate=args.simulate,
            focus_axes=args.focus_axis,
            validation_profile=args.validation_profile,
        )
    print(json.dumps(result.to_dict(), indent=2))


if __name__ == "__main__":
    main()
