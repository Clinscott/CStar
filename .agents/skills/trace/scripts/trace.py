import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.tools.trace_viz import TraceVisualizer

def main():
    parser = argparse.ArgumentParser(description="Neural Trace Visualization: Visual replay of agent intent.")
    parser.add_argument("query", nargs="?", help="The natural language query to visualize")
    parser.add_argument("--file", "-f", help="Path to a JSON trace file to replay")
    parser.add_argument("--war-room", "-w", action="store_true", help="Enter Conflict Analysis Mode")

    args = parser.parse_args()

    if args.war_room:
        TraceVisualizer.mode_war_room()
    elif args.file:
        TraceVisualizer.mode_file(args.file)
    elif args.query:
        TraceVisualizer.mode_live(args.query)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
