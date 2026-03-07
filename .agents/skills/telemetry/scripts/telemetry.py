import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.telemetry import SubspaceTelemetry

def main():
    parser = argparse.ArgumentParser(description="Subspace Telemetry: Manage mission pulses.")
    subparsers = parser.add_subparsers(dest="command")

    # Flare Command
    flare_parser = subparsers.add_parser("flare")
    flare_parser.add_argument("--path", required=True)
    flare_parser.add_argument("--agent", default="ALFRED")
    flare_parser.add_argument("--action", default="SCAN")

    # Trace Command
    trace_parser = subparsers.add_parser("trace")
    trace_parser.add_argument("--mission", required=True)
    trace_parser.add_argument("--file", required=True)
    trace_parser.add_argument("--metric", required=True)
    trace_parser.add_argument("--score", type=float, default=0.0)
    trace_parser.add_argument("--justification", required=True)
    trace_parser.add_argument("--status", default="SUCCESS")
    trace_parser.add_argument("--final_score", type=float, default=1.0)

    args = parser.parse_args()

    if args.command == "flare":
        success = SubspaceTelemetry.flare(args.path, args.agent, args.action)
        if success:
            print(f"[🔱] Flare dispatched for {args.path}")
        else:
            print(f"[ALFRED]: Pulse failed to reach PennyOne.")
            sys.exit(1)

    elif args.command == "trace":
        success = SubspaceTelemetry.log_trace(
            args.mission, args.file, args.metric, args.score, 
            args.justification, args.status, args.final_score
        )
        if success:
            print(f"[🔱] Mission trace recorded: {args.mission}")
        else:
            print(f"[ALFRED]: Hall of Records offline. Trace lost in the Void.")
            sys.exit(1)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
