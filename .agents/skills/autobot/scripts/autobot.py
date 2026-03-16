import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.autobot_skill import execute_autobot


def main() -> None:
    parser = argparse.ArgumentParser(description="Authoritative AutoBot skill entrypoint.")
    parser.add_argument("--project-root")
    parser.add_argument("--bead-id")
    parser.add_argument("--claim-next", action="store_true")
    parser.add_argument("--checker-shell")
    parser.add_argument("--max-attempts", type=int, default=3)
    parser.add_argument("--timeout", type=float, default=300.0)
    parser.add_argument("--startup-timeout", type=float, default=30.0)
    parser.add_argument("--checker-timeout", type=float, default=300.0)
    parser.add_argument("--grace-seconds", type=float, default=3.0)
    parser.add_argument("--agent-id", default="AUTOBOT")
    parser.add_argument("--worker-note")
    parser.add_argument("--autobot-dir", default="/home/morderith/Corvus/AutoBot")
    parser.add_argument("--command", default="hermes")
    parser.add_argument("--command-arg", action="append", default=[])
    parser.add_argument("--env", action="append", default=[])
    parser.add_argument("--ready-regex", default=r"(?:^|\n)\s*❯\s*$")
    parser.add_argument("--done-regex", action="append", default=[])
    parser.add_argument(
        "--stream",
        action="store_true",
        help="Relay Hermes and checker output live. Disabled by default so stdout stays valid JSON.",
    )
    args = parser.parse_args()

    if args.claim_next and args.bead_id:
        parser.error("Use either --bead-id or --claim-next, not both.")
    if not args.claim_next and not args.bead_id:
        parser.error("Provide --bead-id or use --claim-next.")

    env = {}
    for item in args.env:
        key, sep, value = item.partition("=")
        if not sep or not key:
            parser.error(f"Invalid --env entry {item!r}; expected KEY=VALUE.")
        env[key] = value

    target_root = Path(args.project_root).resolve() if args.project_root else PROJECT_ROOT

    try:
        result = execute_autobot(
            target_root,
            bead_id=args.bead_id,
            claim_next=args.claim_next,
            autobot_dir=args.autobot_dir,
            command=args.command,
            command_args=args.command_arg,
            env=env,
            ready_regex=args.ready_regex,
            done_regexes=args.done_regex,
            timeout=args.timeout,
            startup_timeout=args.startup_timeout,
            grace_seconds=args.grace_seconds,
            no_stream=not args.stream,
            agent_id=args.agent_id,
            max_attempts=args.max_attempts,
            checker_shell=args.checker_shell,
            checker_timeout=args.checker_timeout,
            worker_note=args.worker_note,
        )
    except Exception as exc:
        print(
            json.dumps(
                {
                    "skill_id": "autobot",
                    "status": "FAILURE",
                    "outcome": "ERROR",
                    "summary": str(exc),
                    "error_type": type(exc).__name__,
                },
                indent=2,
            )
        )
        raise SystemExit(1)

    print(json.dumps(result.to_dict(), indent=2))
    raise SystemExit(0 if result.status == "SUCCESS" else 4)


if __name__ == "__main__":
    main()
