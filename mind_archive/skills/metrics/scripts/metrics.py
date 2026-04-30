import argparse
import sys
import json
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.metrics import ProjectMetricsEngine

def main():
    parser = argparse.ArgumentParser(description="Project Metrics: Compute project health.")
    parser.add_argument("--compute", action="store_true", help="Compute Global Project Health Score")
    parser.add_argument("--path", default=".", help="Path to analyze")
    
    args = parser.parse_args()

    if args.compute:
        engine = ProjectMetricsEngine()
        score = engine.compute(args.path)
        print(f"[🔱] Global Project Health Score: {score:.2f}%")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
