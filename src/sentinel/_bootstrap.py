"""
Shared bootstrap for Sentinel modules.
Centralizes environment loading and sys.path configuration.
"""
import sys
from pathlib import Path

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
    
    try:
        from dotenv import load_dotenv
        env_local = PROJECT_ROOT / ".env.local"
        if env_local.exists():
            load_dotenv(dotenv_path=env_local)
        else:
            load_dotenv()
    except ImportError:
        pass
    
    _BOOTSTRAPPED = True
    
    # [ALFRED] Persona Synchronization: Ensure HUD aligns with project config
    try:
        from src.core.ui import HUD
        from src.core.utils import load_config
        config = load_config(PROJECT_ROOT)
        persona = config.get("persona") or config.get("Persona") or "ALFRED"
        HUD.PERSONA = str(persona).upper()
    except Exception:
        pass # Fallback to default ALFRED if UI/Config fails
