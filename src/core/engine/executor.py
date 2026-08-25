"""
[SPOKE] Sovereign Executor
Lore: "The Spear of Odin."
Purpose: Handle proactive actions like auto-installation and forge suggestions.
"""

from pathlib import Path
from src.core.sovereign_hud import SovereignHUD
from src.core.engine.cortex import Cortex

class SovereignExecutor:
    def __init__(self, project_root: Path, base_path: Path):
        self.project_root = project_root
        self.base_path = base_path

    def handle_proactive(self, payload) -> None:
        """Retained compatibility hook that never installs or executes."""
        if payload.target_workflow in {"AUTO_INSTALL", "LOCAL_SKILL_CANDIDATE"}:
            SovereignHUD.persona_log(
                "WARN",
                "Automatic skill installation is retired. Review and install through "
                "an explicit operator-approved capability workflow.",
            )

    def suggest_forge(self, query: str) -> None:
        """Reject untracked Forge suggestions without writing legacy lifecycle state."""
        if len(query.split()) < 2:
            return
        SovereignHUD.persona_log(
            "WARN",
            f"Forge bypass retired for '{query}'. Create a CStar request with explicit "
            "targets, outputs, validation, evidence, spend, and operator authorization.",
        )

    def handle_cortex_query(self, query: str) -> None:
        """Direct search against the Knowledge Graph."""
        cortex = Cortex(str(self.project_root), str(self.base_path))
        results = cortex.search(query)

        SovereignHUD.box_top("CORTEX KNOWLEDGE")
        if not results:
            SovereignHUD.box_row("Result", "No documentation matches found.", SovereignHUD.RED)
        else:
            for r in results[:5]:
                SovereignHUD.box_row("SOURCE", r['source'], SovereignHUD.MAGENTA, dim_label=True)
                SovereignHUD.box_row("DOC", r['doc'][:200] + "...", SovereignHUD.DIM)
                SovereignHUD.box_separator()
        SovereignHUD.box_bottom()
