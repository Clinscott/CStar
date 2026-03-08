"""
[BOOTSTRAP]
Lore: "The Awakening of the Ravens."
Purpose: Shared bootstrap for Sentinel modules.
Centralizes environment loading and sys.path configuration.
"""
import sys
from pathlib import Path
from dotenv import load_dotenv

from src.core.sovereign_hud import SovereignHUD
from src.core.utils import SovereignUtils

# Absolute project root resolution
PROJECT_ROOT: Path = Path(__file__).parent.parent.parent.resolve()

_BOOTSTRAPPED: bool = False

class SovereignBootstrap:
    """[O.D.I.N.] Orchestration logic for Corvus Star environment awakening."""

    @staticmethod
    def execute() -> None:
        """
        Load .env.local from project root and add project root to sys.path.
        Synchronizes the active persona from the project configuration.
        """
        global _BOOTSTRAPPED
        if _BOOTSTRAPPED:
            return

        # Ensure project root is at the front of sys.path
        if str(PROJECT_ROOT) not in sys.path:
            sys.path.insert(0, str(PROJECT_ROOT))

        # Environment Loading: Prioritize .env.local, then .env
        env_files = [PROJECT_ROOT / ".env.local", PROJECT_ROOT / ".env"]
        for env_path in env_files:
            if env_path.exists():
                load_dotenv(dotenv_path=env_path)

        # [🔱] ONE MIND ANCHOR: Ensure the agent status is immutable across spokes
        import os
        if os.getenv("GEMINI_CLI_ACTIVE") == "true":
            os.environ["GEMINI_CLI_ACTIVE"] = "true"

        _BOOTSTRAPPED = True

        # [ALFRED] Persona Synchronization: Align SovereignHUD with Config
        try:
            config: dict = SovereignUtils.load_config(str(PROJECT_ROOT))

            # Check both modern 'system.persona' and legacy keys
            legacy_persona: str | None = config.get("persona") or config.get("Persona")
            system_persona: str | None = config.get("system", {}).get("persona")

            persona: str = str(system_persona or legacy_persona or "ALFRED").upper()
            SovereignHUD.PERSONA = persona
        except Exception as e:
            import logging
            logging.warning(f"Bootstrap persona sync failed: {e}")

# [Ω] Phase 2.1 Complete: Legacy bootstrap purged.
