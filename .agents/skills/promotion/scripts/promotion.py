import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.promotion_registry import PromotionRegistry

def main():
    parser = argparse.ArgumentParser(description="Skill Promotion: Manage verified capabilities.")
    parser.add_argument("--register", action="store_true", help="Register a skill promotion")
    parser.add_argument("--verify", action="store_true", help="Verify skill status")
    parser.add_argument("--skill", required=True, help="Name of the skill")
    parser.add_argument("--files", nargs="+", help="Files to include in promotion")
    
    args = parser.parse_args()

    registry = PromotionRegistry(str(PROJECT_ROOT))

    if args.register and args.files:
        file_paths = [Path(f) for f in args.files]
        registry.register_promotion(args.skill, file_paths)
        print(f"[🔱] Skill '{args.skill}' registered and promoted.")
    elif args.verify:
        if registry.is_verified(args.skill):
            print(f"[🔱] Skill '{args.skill}' is VERIFIED.")
        else:
            print(f"[ALFRED]: Skill '{args.skill}' has not been officially promoted.")
            sys.exit(1)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
