"""
Shared bootstrap for Sentinel modules.
Centralizes environment loading and sys.path configuration.
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.absolute()


def bootstrap():
    """Load .env.local from project root and add project root to sys.path."""
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
