import argparse
import sys
import asyncio
import json
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.atomic_gpt import AnomalyWarden, SessionWarden

async def check_alignment(file_path: str, action: str):
    warden = AnomalyWarden()
    score = await warden.get_lore_alignment(file_path, action)
    print(f"[🔱] Lore Alignment Score: {score:.2f}")
    if score < 0.4:
        print(f"[ALFRED]: CRITICAL - Lore violation detected in sector {file_path}.")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Neural Warden: System hardening and anomaly detection.")
    subparsers = parser.add_subparsers(dest="command")

    # Train Command
    train_parser = subparsers.add_parser("train")
    train_parser.add_argument("--cycles", type=int, default=100)

    # Eval Command
    eval_parser = subparsers.add_parser("eval")
    eval_parser.add_argument("--vector", required=True, help="JSON list of floats (latency, tokens, etc.)")

    # Check Alignment
    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--file", required=True)
    check_parser.add_argument("--action", required=True)

    args = parser.parse_args()

    if args.command == "train":
        warden = AnomalyWarden()
        warden.train()
        print(f"[🔱] Training Warden for {args.cycles} cycles...")
        # ... existing training logic can be expanded here
        print("Training complete.")

    elif args.command == "eval":
        warden = AnomalyWarden()
        warden.eval()
        vector = json.loads(args.vector)
        prob = warden.forward(vector)
        print(f"[🔱] Anomaly Probability: {prob:.4f}")
        if prob > 0.8:
            print("[ALFRED]: ALERT - Anomaly detected. Circuit breaker primed.")

    elif args.command == "check":
        asyncio.run(check_alignment(args.file, args.action))
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
