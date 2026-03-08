
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel.wardens.huginn import HuginnWarden


class TestHuginnEmpire:
    """
    [Saga] Huginn Neural Trace Analysis Verification.
    """

    @pytest.fixture
    def mock_root(self, tmp_path):
        """Creates a mock project root with .agents/traces."""
        traces_dir = tmp_path / ".agents" / "traces"
        traces_dir.mkdir(parents=True)
        return tmp_path

    def test_scan_no_traces(self, mock_root):
        warden = HuginnWarden(mock_root)
        # Mock trace_dir to a mock object that returns False for exists()
        mock_trace_dir = MagicMock(spec=Path)
        mock_trace_dir.exists.return_value = False
        warden.trace_dir = mock_trace_dir
        
        results = warden.scan()
        assert results == []

    def test_scan_regex_hallucination(self, mock_root):
        """Test detection of repeated headers (hallucination)."""
        trace_file = mock_root / ".agents" / "traces" / "session_hallucinate.md"
        # Create content with repeated headers
        content = "# Header\n# Header\n# Header\n"
        trace_file.write_text(content, encoding='utf-8')

        warden = HuginnWarden(mock_root)
        # Mock _scan_neural_async to return empty list to focus on regex
        with patch.object(warden, "_scan_neural_async", return_value=[]):
            results = warden.scan()

            breach = next((b for b in results if b["type"] == "HALLUCINATION_REPEATED_HEADER"), None)
            assert breach is not None
            # Path might use backslashes on Windows, normalize for comparison
            assert Path(breach["file"]).as_posix() == ".agents/traces/session_hallucinate.md"
            assert "Header" in breach["action"]

    def test_scan_regex_deviance(self, mock_root):
        """Test detection of suspicious paths."""
        trace_file = mock_root / ".agents" / "traces" / "session_deviance.md"
        content = "Saving to /tmp/suspicious_file.txt"
        trace_file.write_text(content, encoding='utf-8')

        warden = HuginnWarden(mock_root)
        with patch.object(warden, "_scan_neural_async", return_value=[]):
            results = warden.scan()

            breach = next((b for b in results if b["type"] == "DEVIANCE_TEMP_PATH"), None)
            assert breach is not None
            assert "/tmp/suspicious_file.txt" in breach["action"]

    @patch("src.sentinel.wardens.huginn.AntigravityUplink")
    def test_scan_neural_audit(self, mock_uplink_cls, mock_root):
        """Test neural audit invocation and parsing."""
        trace_file = mock_root / ".agents" / "traces" / "session_latest.md"
        trace_file.write_text("Valid session content.", encoding='utf-8')

        # Setup mock uplink response
        mock_uplink = mock_uplink_cls.return_value
        mock_uplink.send_payload = MagicMock()
        
        # Async mock for send_payload
        async def mock_send(*args, **kwargs):
            return {
                "status": "success",
                "data": {
                    "raw": '{"breaches": [{"description": "Agent loop detected", "confidence": 0.9}]}'
                }
            }
        mock_uplink.send_payload.side_effect = mock_send

        warden = HuginnWarden(mock_root)
        warden.uplink = mock_uplink

        results = warden.scan()

        # Should find the neural breach
        breach = next((b for b in results if b["type"] == "HUGINN_NEURAL_DETECT"), None)
        assert breach is not None
        assert "Agent loop detected" in breach["action"]
