from __future__ import annotations

import argparse
import json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--project-root",
        default=".",
        help="Retired compatibility option; no repository access occurs.",
    )
    args = parser.parse_args()

    print(json.dumps({
        "status": "FAILURE",
        "summary": (
            "Ravens cycle execution is decommissioned. This compatibility entrypoint "
            "cannot spawn workers, mutate repositories, run tests, change branches, or commit."
        ),
        "metadata": {
            "adapter": "compatibility:ravens-cycle-rejected",
            "requested_project_root": args.project_root,
            "decommissioned": True,
            "read_only": True,
            "execution_attempted": False,
        },
    }, indent=2))
    raise SystemExit(2)


if __name__ == "__main__":
    main()
