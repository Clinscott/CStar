from pathlib import Path

import pytest

from src.sentinel.wardens.base import BaseWarden


class ConcreteWarden(BaseWarden):
    def scan(self):
        return [{"type": "MOCK_BREACH", "file": "mock.py", "action": "Fix", "severity": "LOW"}]

@pytest.fixture
def mock_warden(tmp_path):
    """Creates a concrete warden for testing base logic."""
    return ConcreteWarden(tmp_path)

def test_base_warden_load_config(mock_warden, tmp_path):
    """Verifies that BaseWarden loads config from .agent/config.json."""
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    (agent_dir / "config.json").write_text('{"test_key": "test_val"}', encoding='utf-8')

    config = mock_warden._load_config()
    assert config["test_key"] == "test_val"

def test_base_warden_should_ignore(mock_warden):
    """Verifies the ignore logic in BaseWarden."""
    assert mock_warden._should_ignore(Path(".git/config")) is True
    assert mock_warden._should_ignore(Path("src/main.py")) is False

@pytest.mark.asyncio
async def test_base_warden_scan_async(mock_warden):
    """Verifies the async scan wrapper."""
    results = await mock_warden.scan_async()
    assert len(results) == 1
    assert results[0]["type"] == "MOCK_BREACH"

@pytest.mark.asyncio
async def test_base_warden_propose_evolution(mock_warden):
    """Verifies self-evolution proposal logic."""
    evolution = await mock_warden.propose_evolution("Too many false positives")
    assert evolution["type"] == "WARDEN_EVOLUTION"
    assert "EVOLVE:" in evolution["action"]
    assert evolution["severity"] == "CRITICAL"
