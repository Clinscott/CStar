"""
[SPOKE] Sovereign Executor
Lore: "The Spear of Odin."
Purpose: Handle proactive actions like auto-installation and forge suggestions.
"""

import sys
import subprocess
from pathlib import Path
from src.core.sovereign_hud import SovereignHUD
from src.core.engine.cortex import Cortex

class SovereignExecutor:
    def __init__(self, project_root: Path, base_path: Path):
        self.project_root = project_root
        self.base_path = base_path

    def handle_proactive(self, payload) -> None:
        """Executes automated tasks based on payload triggers."""
        if payload.target_workflow == "AUTO_INSTALL":
            skill_name = payload.extracted_entities.get("skill_name")
            if skill_name:
                clean_name = skill_name.replace("GLOBAL:", "")
                install_script = self.project_root / "src" / "skills" / "install_skill.py"
                command = f"{sys.executable} {install_script} {clean_name} {self.base_path}"
                subprocess.run(command, shell=True, cwd=str(self.project_root))  # noqa: S602

    def suggest_forge(self, query: str) -> None:
        """Autonomously triggers JIT Skill Forging if no good match is found."""
        if len(query.split()) < 2:
            return

        msg = f"Raven's Insight: No existing skill matches '{query}'. Igniting the Forge..."
        SovereignHUD.persona_log("INFO", msg)
        
        from src.core.engine.skill_forger import SkillForger
        forger = SkillForger(self.project_root)
        
        # We run this sync or handle event loop since we are in sync land here
        import asyncio
        try:
            asyncio.run(forger.sv_forge_skill(query))
        except RuntimeError:
            # If loop already running
            loop = asyncio.get_event_loop()
            loop.run_until_complete(forger.sv_forge_skill(query))

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
