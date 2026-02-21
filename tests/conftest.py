"""Shared fixtures for sentinel tests."""
import os
import sys
import pytest
from pathlib import Path
from unittest.mock import MagicMock

# ---------------------------------------------------------------------------
# Centralised sys.path setup — ensures every bare import used by tests
# (annex, edda, ui, report_engine, network_watcher, odin_protocol, factories,
#  check_pro, cjk_check, debug_engine, sv_engine) resolves correctly.
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent

_paths_to_add = [
    PROJECT_ROOT,                                        # src.* imports
    PROJECT_ROOT / "src" / "core",                       # annex, edda, ui, report_engine, sv_engine
    PROJECT_ROOT / "src" / "core" / "engine",            # vector (SovereignVector)
    PROJECT_ROOT / "src" / "tools",                      # network_watcher
    PROJECT_ROOT / "src" / "tools" / "debug",            # check_pro, cjk_check, debug_engine
    PROJECT_ROOT / "src" / "games",                      # odin_protocol.*
    PROJECT_ROOT / ".agent" / "scripts" / "empire",      # factories
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
