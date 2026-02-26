import os
import sys

from src.sentinel._bootstrap import PROJECT_ROOT, bootstrap


def test_project_root_resolution():
    """Verifies that PROJECT_ROOT is correctly resolved."""
    # Based on the file location: src/sentinel/_bootstrap.py
    # parent.parent.parent should be the root.
    assert PROJECT_ROOT.name == "CorvusStar"
    assert (PROJECT_ROOT / "src").exists()

def test_bootstrap_sys_path():
    """Verifies that bootstrap adds PROJECT_ROOT to sys.path."""
    # Reset bootstrapped state for test if possible (or just check existence)
    bootstrap()
    assert str(PROJECT_ROOT) in sys.path
    # Check that it's at the front
    assert sys.path[0] == str(PROJECT_ROOT)

def test_bootstrap_env_loading(tmp_path, monkeypatch):
    """Verifies that bootstrap loads .env.local if present."""
    # Create a mock .env.local in a mock root
    mock_root = tmp_path / "mock_root"
    mock_root.mkdir()
    (mock_root / ".env.local").write_text("MOCK_KEY=MOCK_VALUE", encoding='utf-8')

    # Patch PROJECT_ROOT in _bootstrap
    import src.sentinel._bootstrap
    monkeypatch.setattr(src.sentinel._bootstrap, "PROJECT_ROOT", mock_root)
    monkeypatch.setattr(src.sentinel._bootstrap, "_BOOTSTRAPPED", False)

    bootstrap()

    assert os.getenv("MOCK_KEY") == "MOCK_VALUE"

    # Cleanup env
    monkeypatch.delenv("MOCK_KEY", raising=False)

def test_bootstrap_persona_sync(tmp_path, monkeypatch):
    """Verifies that bootstrap synchronizes the persona from config."""
    mock_root = tmp_path / "mock_root_persona"
    mock_root.mkdir()
    agent_dir = mock_root / ".agent"
    agent_dir.mkdir()
    (agent_dir / "config.json").write_text('{"persona": "ODIN"}', encoding='utf-8')

    import src.sentinel._bootstrap
    from src.core.sovereign_hud import SovereignHUD

    monkeypatch.setattr(src.sentinel._bootstrap, "PROJECT_ROOT", mock_root)
    monkeypatch.setattr(src.sentinel._bootstrap, "_BOOTSTRAPPED", False)

    bootstrap()

    assert SovereignHUD.PERSONA == "ODIN"
