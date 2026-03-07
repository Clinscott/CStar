import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.edda import EddaWeaver

def main():
    parser = argparse.ArgumentParser(description="Edda: Transmute and synthesize documentation.")
    parser.add_argument("--scan", action="store_true", help="Scan and transmute .md to .qmd")
    parser.add_argument("--path", default=".", help="Root directory to scan")
    parser.add_argument("--synthesize", help="Generate API docs for source file")
    
    args = parser.parse_args()

    quarantine_dir = PROJECT_ROOT / ".corvus_quarantine"
    weaver = EddaWeaver(PROJECT_ROOT / args.path, quarantine_dir)

    if args.scan:
        weaver.scan_and_transmute()
    elif args.synthesize:
        weaver.synthesize_api(Path(args.synthesize))
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
