
"""
Shared bootstrap for Sentinel modules.
Centralizes environment loading and sys.path configuration.
"""
import sys
from pathlib import Path

from dotenv import load_dotenv

from src.core.sovereign_hud import SovereignHUD
from src.core.utils import load_config

# Absolute project root resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent.resolve()

_BOOTSTRAPPED = False

def bootstrap() -> None:
    """Load .env.local from project root and add project root to sys.path."""
    global _BOOTSTRAPPED
    if _BOOTSTRAPPED:
        return

    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    env_local = PROJECT_ROOT / ".env.local"
    if env_local.exists():
        load_dotenv(dotenv_path=env_local)
    else:
        load_dotenv()

    _BOOTSTRAPPED = True

    # [ALFRED] Persona Synchronization
    try:
        config = load_config(str(PROJECT_ROOT))
        persona = config.get("persona") or config.get("Persona") or "ALFRED"
        SovereignHUD.PERSONA = str(persona).upper()
    except Exception as e:
        import logging
        logging.warning(f"Bootstrap persona sync failed: {e}")
