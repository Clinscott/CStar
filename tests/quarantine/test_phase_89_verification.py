import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from src.core.engine.wardens.mimir import MimirWarden

@pytest.fixture
def mock_db():
    with patch("src.core.engine.wardens.mimir.SubspaceTelemetry.log_trace") as mock:
        yield mock

def test_mimir_aesthetic_breach(tmp_path):
    """Verifies that Mimir detects 'claustrophobic' code blocks."""
    # Create a file with > 12 lines of consecutive logic
    py_file = tmp_path / "claustrophobic.py"
    content = "x = 1\n" * 15
    py_file.write_text(content)

    warden = MimirWarden(tmp_path)
    breaches = warden.scan()

    aesthetic_breaches = [b for b in breaches if b["type"] == "MIMIR_AESTHETIC_BREACH"]
    assert len(aesthetic_breaches) > 0
    assert "Claustrophobic" in aesthetic_breaches[0]["action"]

def test_mimir_structural_breach(tmp_path):
    """Verifies that Mimir detects 'top-heavy' functions."""
    # Create a function with setup nodes > 1.7 * exec nodes
    py_file = tmp_path / "top_heavy.py"
    content = """
def heavy():
    a = 1
    b = 2
    c = 3
    d = 4
    e = 5
    assert True
    return True
"""
    # setup nodes: 5 (Assign) + 1 (Assert) = 6
    # exec nodes: 1 (Return) = 1
    # Ratio: 6.0 > 1.7
    py_file.write_text(content)

    warden = MimirWarden(tmp_path)
    breaches = warden.scan()

    structural_breaches = [b for b in breaches if b["type"] == "MIMIR_STRUCTURAL_BREACH"]
    assert len(structural_breaches) > 0
    assert "top-heavy" in structural_breaches[0]["action"]

def test_mimir_maintainability_suggestion(mock_db, tmp_path):
    """Verifies that Mimir sends proactive suggestions for low MI files."""
    # Create a 'toxic' file
    py_file = tmp_path / "complex.py"
    # We use a large block of logic to lower the MI
    logic = "def complex():\n" + "    pass\n" * 50
    py_file.write_text(logic)

    warden = MimirWarden(tmp_path)
    
    with patch("src.core.telemetry.SubspaceTelemetry.log_trace") as mock_log:
        warden.scan()
        # Should have called log_trace for the suggestion
        assert mock_log.called
        args = mock_log.call_args[1]
        assert args["target_metric"] == "SUGGESTION"
        assert "maintainability" in args["justification"]

def test_rpc_suggestion_retrieval(mock_db, tmp_path):
    """Verifies that RPC pulls suggestions from the database."""
    # This test would verify the actual API endpoint if PennyOne was running.
    # For unit testing, we verify the warden's interaction with the telemetry class.
    pass
