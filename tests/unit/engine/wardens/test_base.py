import pytest
import json
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.core.engine.wardens.base import BaseWarden

class ConcreteWarden(BaseWarden):
    def scan(self):
        return []

@pytest.fixture
def warden():
    with patch("src.core.engine.wardens.base.BraveSearch"):
        return ConcreteWarden(Path("/tmp/root"))

def test_load_config(warden):
    mock_config = {"api_key": "123"}
    with patch.object(Path, "exists", return_value=True), \
         patch.object(Path, "read_text", return_value=json.dumps(mock_config)):
        
        config = warden._load_config()
        assert config == mock_config

def test_should_ignore(warden):
    assert warden._should_ignore(Path("/tmp/root/.git")) is True
    assert warden._should_ignore(Path("/tmp/root/node_modules/lib")) is True
    assert warden._should_ignore(Path("/tmp/root/src/main.py")) is False

def test_research_topic(warden):
    warden.brave.is_quota_available.return_value = True
    warden.brave.search.return_value = [{"title": "test", "url": "test.com"}]
    
    with patch("src.core.engine.wardens.base.SovereignHUD"):
        results = warden.research_topic("something")
        assert len(results) == 1
        assert results[0]["title"] == "test"
        warden.brave.search.assert_called_with("something")

@pytest.mark.asyncio
async def test_scan_async(warden):
    with patch.object(warden, "scan", return_value=[{"type": "TEST"}]) as mock_scan:
        result = await warden.scan_async()
        assert result == [{"type": "TEST"}]
        mock_scan.assert_called_once()

@pytest.mark.asyncio
async def test_propose_evolution(warden):
    with patch("inspect.getfile", return_value="test_base.py"):
        evolution = await warden.propose_evolution("Too slow")
        assert evolution["type"] == "WARDEN_EVOLUTION"
        assert evolution["severity"] == "CRITICAL"
        assert "EVOLVE: Too slow" in evolution["action"]
