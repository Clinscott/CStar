"""Shared fixtures for sentinel tests."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# ---------------------------------------------------------------------------
# Centralised sys.path setup — ensures every bare import used by tests
# (annex, edda, ui, report_engine, network_watcher, odin_protocol, factories,
#  check_pro, cjk_check, debug_engine, sv_engine) resolves correctly.
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent

_paths_to_add = [
    PROJECT_ROOT,                                        # src.* imports
]

for p in _paths_to_add:
    _p = str(p)
    if _p not in sys.path:
        sys.path.insert(0, _p)


@pytest.fixture
def mock_genai_client():
    """Provides a mock Gemini client that doesn't require API keys."""
    client = MagicMock()
    # Default: generate_content returns a mock with .text
    response = MagicMock()
    response.text = '{"status": "APPROVED", "reason": "Looks good."}'
    client.models.generate_content.return_value = response
    return client


@pytest.fixture
def temp_project(tmp_path):
    """Creates a minimal project directory for testing."""
    (tmp_path / "src").mkdir()
    (tmp_path / "tests").mkdir()
    (tmp_path / ".agent").mkdir()
    # Create a simple Python file to scan
    sample = tmp_path / "src" / "sample.py"
    sample.write_text("def hello():\n    print('hi')\n", encoding="utf-8")
    return tmp_path


@pytest.fixture(autouse=True)
def prevent_api_key_leak(monkeypatch):
    """
    Ensure real API keys from .env.local are never available to tests,
    preventing leaks in assertion diffs.
    """
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("MUNINN_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)


@pytest.fixture(autouse=True)
def isolate_warden_state():
    """
    Prevent AnomalyWarden state files from leaking between tests.
    Removes .agent/warden.pkl (and variants) before and after each test
    so no test inherits stale weights from a previous one.
    """
    warden_files = [
        Path(".agent/warden.pkl"),
        Path(".agent/warden_test.pkl"),
    ]

    def _cleanup():
        for f in warden_files:
            if f.exists():
                try:
                    f.unlink()
                except OSError:
                    pass

    _cleanup()
    yield
    _cleanup()


@pytest.fixture(autouse=True)
def reset_hud_singleton():
    """
    [ALFRED] Multi-targeted reset of the SovereignHUD singleton class.
    Identifies all instances of SovereignHUD in sys.modules (both src.core.sovereign_hud 
    and the raw ui import) and scrubs them to prevent cross-test 
    contamination.
    """
    import sys
    import unittest.mock

    def _get_hud_instances():
        instances = []
        if "src.core.sovereign_hud" in sys.modules:
            instances.append(sys.modules["src.core.sovereign_hud"].SovereignHUD)
        if "ui" in sys.modules:
            instances.append(sys.modules["ui"].SovereignHUD)
        return list(set(instances)) # Unique classes

    # Store original methods once for each unique SovereignHUD class found
    if not hasattr(reset_hud_singleton, "_originals_map"):
        reset_hud_singleton._originals_map = {}

    huds = _get_hud_instances()
    for SovereignHUD in huds:
        if SovereignHUD not in reset_hud_singleton._originals_map:
            # Only store originals if they ARE NOT Mocks.
            # If we already have a mock at this point, we can't save the 'original'.
            originals = {}
            methods = [
                "box_top", "box_row", "box_bottom", "log", "persona_log",
                "warning", "broadcast", "render_loop", "stream_text",
                "progress_bar", "render_sparkline", "_speak", "_ensure_persona"
            ]
            for name in methods:
                val = getattr(SovereignHUD, name, None)
                if val and not isinstance(val, (unittest.mock.Mock, unittest.mock.MagicMock)):
                    originals[name] = val

            reset_hud_singleton._originals_map[SovereignHUD] = originals

    def _full_reset():
        # 1. Kill any persistent patches
        unittest.mock.patch.stopall()

        # 2. Reset each unique SovereignHUD class
        huds = _get_hud_instances()
        for SovereignHUD in huds:
            SovereignHUD.PERSONA = "ALFRED"
            SovereignHUD._INITIALIZED = False
            SovereignHUD.DIALOGUE = None
            SovereignHUD._render_queue = None
            SovereignHUD._render_lock = None
            if hasattr(SovereignHUD, "_last_width"):
                delattr(SovereignHUD, "_last_width")

            # Restore methods ONLY if they are currently Mocks.
            originals = reset_hud_singleton._originals_map.get(SovereignHUD, {})
            for name, original in originals.items():
                current_val = getattr(SovereignHUD, name, None)
                if isinstance(current_val, (unittest.mock.Mock, unittest.mock.MagicMock)):
                    setattr(SovereignHUD, name, original)

        # 3. Diagnostic: Check if any OTHER module has a SovereignHUD that we missed
        for mod_name, mod in list(sys.modules.items()):
            if mod_name.startswith("tests") or mod_name.startswith("src"):
                if hasattr(mod, "SovereignHUD") and mod.SovereignHUD not in huds:
                    # Found a shadow SovereignHUD!
                    pass

    _full_reset()
    yield
    _full_reset()

