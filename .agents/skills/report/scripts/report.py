import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.report_engine import ReportEngine

def main():
    parser = argparse.ArgumentParser(description="Persona Reporting: Generate stylized mission reports.")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--status", default="INFO", choices=["INFO", "PASS", "FAIL", "WARN"])
    
    args = parser.parse_args()

    engine = ReportEngine(PROJECT_ROOT)
    report = engine.generate_report(args.title, args.body, args.status)
    print(report)

if __name__ == "__main__":
    main()
