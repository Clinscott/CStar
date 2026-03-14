#!/usr/bin/env python3
"""
[O.D.I.N.] Sovereign Engine (sv_engine.py)
Orchestrates neural search, cortex queries, and proactive skill installation.
Standard: Linscott Protocol ([L] > 4.0 Compliance).
Architecture: Spoke Decomposition (Context, Injector, Executor, Reporter, Builder, Orchestrator).
"""

# Intent: Core compute engine for natural language intent resolution and environment orchestration.

import argparse
import os
import sys
from pathlib import Path

# [ALFRED] Ensure environment is loaded and root is in sys.path
try:
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from src.sentinel._bootstrap import SovereignBootstrap
    SovereignBootstrap.execute()
except (ImportError, ValueError, IndexError) as e:
    print(f"Bootstrap Failure: {e}")

from src.core import utils
from src.core.sovereign_hud import SovereignHUD
from src.core.engine.builder import SovereignBuilder
from src.core.engine.context import SovereignContext
from src.core.engine.executor import SovereignExecutor
from src.core.engine.injector import SovereignInjector
from src.core.engine.orchestrator import SovereignOrchestrator
from src.core.engine.reporter import SovereignReporter


class SovereignEngine:
    """
    [O.D.I.N.] The Master Engine of Corvus Star.
    V6: Spoke-based Orchestration for High Maintainability.
    """

    def __init__(self, project_root: Path | None = None) -> None:
        self.project_root = project_root or Path(os.getcwd())
        
        # Initialize Spokes
        self.ctx = SovereignContext(self.project_root)
        self.injector = SovereignInjector(self.project_root, self.ctx.THRESHOLDS)
        self.executor = SovereignExecutor(self.project_root, self.ctx.base_path)
        self.reporter = SovereignReporter(self.ctx.base_path, self.ctx.THRESHOLDS)
        self.builder = SovereignBuilder(self.project_root, self.ctx.base_path, self.ctx.THRESHOLDS)
        self.orchestrator = SovereignOrchestrator(
            self.project_root, 
            self.ctx.base_path, 
            self.ctx.THRESHOLDS, 
            self.ctx.config
        )
        
        # Build Vector Engine via Builder spoke
        self.engine = self.builder.build_vector_engine(self.injector.skills_db_path)

    def run(
        self,
        query: str,
        json_mode: bool = False,
        record: bool = False,
        use_cortex: bool = False,
    ) -> None:
        """Delegate orchestration to the Orchestrator spoke."""
        if use_cortex and query:
            self.executor.handle_cortex_query(query)
            return

        self.orchestrator.execute_search(
            query=query,
            engine=self.engine,
            injector=self.injector,
            executor=self.executor,
            reporter=self.reporter,
            context=self.ctx,
            record=record,
            json_mode=json_mode
        )

    def teardown(self) -> None:
        """Delegates teardown to the context spoke."""
        self.ctx.teardown(self.engine)


def main() -> None:
    """CLI entry point for sv_engine.py."""
    parser = argparse.ArgumentParser(description="Corvus Star Sovereign Engine")
    parser.add_argument("query", nargs="*", help="Query phrase or intent")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")
    parser.add_argument("--record", action="store_true", help="Record neural trace")
    parser.add_argument("--benchmark", action="store_true", help="Display diagnostic info")
    parser.add_argument("--cortex", action="store_true", help="Query the Knowledge Graph")
    args = parser.parse_args()

    engine = SovereignEngine()

    if args.benchmark:
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
    try:
        engine.run(
            query=query,
            json_mode=args.json,
            record=args.record,
            use_cortex=args.cortex
        )
    finally:
        engine.teardown()


if __name__ == "__main__":
    main()
