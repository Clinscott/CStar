import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.sv_engine import SovereignEngine
from src.core import utils

def main():
    parser = argparse.ArgumentParser(description="Sovereign Style: Neural search and orchestration.")
    parser.add_argument("query", nargs="*", help="Query phrase or intent")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")
    parser.add_argument("--record", action="store_true", help="Record neural trace")
    parser.add_argument("--benchmark", action="store_true", help="Display diagnostic info")
    parser.add_argument("--cortex", action="store_true", help="Query the Knowledge Graph")
    
    args = parser.parse_args()

    engine = SovereignEngine(PROJECT_ROOT)

    if args.benchmark:
        from src.core.sovereign_hud import SovereignHUD
        ve = engine.engine
        SovereignHUD.box_top("DIAGNOSTIC")
        SovereignHUD.box_row("ENGINE", "SovereignVector 2.5 (Iron)", SovereignHUD.CYAN)
        SovereignHUD.box_row("PERSONA", SovereignHUD.PERSONA, SovereignHUD.MAGENTA)
        SovereignHUD.box_separator()
        SovereignHUD.box_row("SKILLS", f"{len(ve.skills)}", SovereignHUD.GREEN)
        SovereignHUD.box_row("TOKENS", f"{len(ve.vocab)}", SovereignHUD.YELLOW)
        SovereignHUD.box_row("VECTORS", f"{len(ve.vectors)}", SovereignHUD.CYAN)
        SovereignHUD.box_bottom()
        sys.exit(0)

    query = utils.sanitize_query(" ".join(args.query))
    if query:
        try:
            engine.run(
                query=query,
                json_mode=args.json,
                record=args.record,
                use_cortex=args.cortex
            )
        finally:
            engine.teardown()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
