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
from src.core.utils import load_config

# Absolute project root resolution
PROJECT_ROOT: Path = Path(__file__).parent.parent.parent.resolve()

_BOOTSTRAPPED: bool = False

def bootstrap() -> None:
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

    # Environment Loading: Prioritize .env.local
    env_local: Path = PROJECT_ROOT / ".env.local"
    if env_local.exists():
        load_dotenv(dotenv_path=env_local)
    else:
        load_dotenv()

    _BOOTSTRAPPED = True

    # [ALFRED] Persona Synchronization: Align SovereignHUD with Config
    try:
        config: dict = load_config(str(PROJECT_ROOT))

        # Check both modern 'system.persona' and legacy keys
        legacy_persona: str | None = config.get("persona") or config.get("Persona")
        system_persona: str | None = config.get("system", {}).get("persona")

        persona: str = str(system_persona or legacy_persona or "ALFRED").upper()
        SovereignHUD.PERSONA = persona
    except Exception as e:
        import logging
        logging.warning(f"Bootstrap persona sync failed: {e}")
