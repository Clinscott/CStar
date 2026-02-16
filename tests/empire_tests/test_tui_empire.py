"""
Empire Test Suite for Sovereign HUD (TUI)
Adheres to Linscott Standard for Verification.

Tests cover:
1. DaemonClient connectivity & degradation
2. TUI Component Instantiation
3. CSS Validity (Static Check)
4. Transition Logic
"""
import pytest
import asyncio
import json
from unittest.mock import MagicMock, AsyncMock, patch
from textual.app import App
from src.cstar.core.tui import SovereignApp, DaemonClient, TransitionScreen, PROJECT_ROOT

@pytest.mark.asyncio
async def test_daemon_client_success():
    """Verify DaemonClient returns parsed JSON on successful connection."""
    mock_reader = AsyncMock()
    mock_reader.read.return_value = json.dumps({"status": "ok"}).encode('utf-8')
    mock_writer = AsyncMock()
    
    with patch("asyncio.open_connection", return_value=(mock_reader, mock_writer)) as mock_connect:
        client = DaemonClient()
        response = await client.send_command({"cmd": "test"})
        
        assert response == {"status": "ok"}
        mock_connect.assert_called_with("127.0.0.1", 50051)

@pytest.mark.asyncio
async def test_daemon_client_failure():
    """Verify graceful degradation (ALFRED persona) when daemon fails."""
    with patch("asyncio.open_connection", side_effect=ConnectionRefusedError):
        client = DaemonClient()
        response = await client.send_command({"cmd": "test"})
        
        assert response["persona"] == "ALFRED"
        assert response["status"] == "disconnected"
        assert response["error"] is True

def test_tui_instantiation():
    """Verify SovereignApp can be instantiated and CSS is valid."""
    app = SovereignApp()
    assert app.title == "C* SOVEREIGN HUD"
    # Basic check that CSS was parsed (Textual parses on class definition)
    assert "Screen" in app.CSS
    assert ".theme-odin" in app.CSS

@pytest.mark.asyncio
async def test_transition_screen_logic():
    """Verify TransitionScreen initializes with correct persona."""
    screen = TransitionScreen(new_persona="ODIN")
    assert screen.new_persona == "ODIN"
    
    screen_alfred = TransitionScreen(new_persona="ALFRED")
    assert screen_alfred.new_persona == "ALFRED"

def test_project_root_resolution():
    """Verify PROJECT_ROOT is resolved correctly relative to tui.py."""
    # It should point to the root of the repo, checking existence of pyproject.toml is a good proxy
    assert (PROJECT_ROOT / "pyproject.toml").exists()

