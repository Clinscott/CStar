"""
[EMPIRE TDD] Gemini CLI Decoupling Verification
Lore: "Verifying the severed strings of the Gungnir Calculus."
Standard: Linscott Standard (Atomic Code/Verification)
"""

import os
import json
import pytest
import asyncio
from unittest.mock import patch, MagicMock
from pathlib import Path

# Shared Bootstrap
import sys
project_root = Path(__file__).resolve().parents[2]
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.uplink import AntigravityUplink
from src.sentinel.muninn import Muninn

@pytest.mark.asyncio
async def test_uplink_emits_directive_in_gemini_mode(capsys):
    """
    Scenario: AntigravityUplink emits [GEMINI_DIRECTIVE] in Gemini Mode
    """
    # GIVEN: GEMINI_CLI_ACTIVE is true
    with patch.dict(os.environ, {"GEMINI_CLI_ACTIVE": "true"}):
        uplink = AntigravityUplink(api_key="TEST_KEY")
        
        # WHEN: A payload is sent
        response = await uplink.send_payload("Test Query", {"persona": "ODIN"})
        
        # THEN: Status should be pending
        assert response["status"] == "pending"
        assert "Directive emitted to Gemini CLI" in response["message"]
        
        # AND: [GEMINI_DIRECTIVE] should be in stdout
        captured = capsys.readouterr()
        assert "[GEMINI_DIRECTIVE]" in captured.out
        assert "[/GEMINI_DIRECTIVE]" in captured.out
        
        # Verify JSON content
        json_str = captured.out.split("[GEMINI_DIRECTIVE]")[1].split("[/GEMINI_DIRECTIVE]")[0].strip()
        directive = json.loads(json_str)
        assert directive["type"] == "LLM_REQUEST"
        assert directive["query"] == "Test Query"
        assert directive["persona"] == "ODIN"

def test_muninn_initialization_decoupled():
    """
    Scenario: Muninn operates without a direct SDK client in Gemini Mode
    """
    # GIVEN: GEMINI_CLI_ACTIVE is true
    with patch.dict(os.environ, {"GEMINI_CLI_ACTIVE": "true"}):
        # Mocking Path.cwd() to avoid dependency on current dir structure if needed
        with patch("os.getenv", side_effect=lambda k, d=None: "true" if k == "GEMINI_CLI_ACTIVE" else "TEST_KEY"):
            m = Muninn()
            
            # THEN: Muninn.client must be None
            assert m.client is None
            
            # AND: Uplink must be initialized
            assert m.uplink is not None
            assert isinstance(m.uplink, AntigravityUplink)

@pytest.mark.asyncio
async def test_huginn_neural_audit_decoupled():
    """
    Scenario: Huginn routes neural audits through Uplink in Gemini Mode
    """
    from src.sentinel.wardens.huginn import HuginnWarden
    
    with patch.dict(os.environ, {"GEMINI_CLI_ACTIVE": "true"}):
        with patch("src.cstar.core.uplink.AntigravityUplink.send_payload") as mock_send:
            mock_send.return_value = {"status": "pending"}
            
            warden = HuginnWarden(project_root)
            
            # Create a dummy trace file
            trace_dir = project_root / ".agent" / "traces"
            trace_dir.mkdir(parents=True, exist_ok=True)
            dummy_trace = trace_dir / "test_trace.md"
            dummy_trace.write_text("Dummy trace content", encoding='utf-8')
            
            # WHEN: Neural audit is triggered
            results = await warden._scan_neural_async(dummy_trace)
            
            # THEN: Uplink should have been called
            mock_send.assert_called_once()
            # AND: Results should be empty (pending)
            assert results == []

if __name__ == "__main__":
    pytest.main([__file__])
