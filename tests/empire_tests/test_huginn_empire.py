
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Mock genai before importing Huginn
sys.modules["google.genai"] = MagicMock()
sys.modules["google.genai.types"] = MagicMock()

from src.sentinel.wardens.huginn import HuginnWarden


class TestHuginnEmpire:
    """
    [Saga] Docstring missing.
    """

    @pytest.fixture
    def mock_root(self, tmp_path):
        """Creates a mock project root with .agent/traces."""
        traces_dir = tmp_path / ".agent" / "traces"
        traces_dir.mkdir(parents=True)

        return tmp_path

    def test_scan_no_traces(self, mock_root):
        warden = HuginnWarden(mock_root)
        results = warden.scan()
        assert results == []

    def test_scan_regex_hallucination(self, mock_root):
        """Test detection of repeated headers (hallucination)."""
        trace_file = mock_root / ".agent" / "traces" / "session_hallucinate.md"
        # Create content with repeated headers
        content = "# Header\n# Header\n# Header\n"
        trace_file.write_text(content, encoding='utf-8')

        warden = HuginnWarden(mock_root)
        # Disable neural scan for this test by ensuring no client
        warden.client = None

        results = warden.scan()

        breach = next((b for b in results if "HALLUCINATION_REPEATED_HEADER" in b["type"]), None)
        assert breach is not None
        assert breach["file"] == str(trace_file.relative_to(mock_root))

    def test_scan_regex_deviance(self, mock_root):
        """Test detection of suspicious paths."""
        trace_file = mock_root / ".agent" / "traces" / "session_deviance.md"
        content = "Saving to /tmp/suspicious_file.txt"
        trace_file.write_text(content, encoding='utf-8')

        warden = HuginnWarden(mock_root)
        warden.client = None

        results = warden.scan()

        breach = next((b for b in results if "DEVIANCE_TEMP_PATH" in b["type"]), None)
        assert breach is not None
        assert "Suspicious temporary path" in breach["action"]

    @patch("src.sentinel.wardens.huginn.genai.Client")
    def test_scan_neural_audit(self, mock_client_cls, mock_root):
        """Test neural audit invocation and parsing."""
        trace_file = mock_root / ".agent" / "traces" / "session_latest.md"
        trace_file.write_text("Valid session content.", encoding='utf-8')

        # Setup mock client response
        mock_client = mock_client_cls.return_value
        mock_response = MagicMock()
        mock_response.text = '{"breaches": [{"description": "Agent loop detected", "confidence": 0.9}]}'
        mock_client.models.generate_content.return_value = mock_response

        warden = HuginnWarden(mock_root)
        # Manually inject client since we might not have API KEY in env
        warden.client = mock_client

        results = warden.scan()

        # Should find the neural breach
        breach = next((b for b in results if b["type"] == "HUGINN_NEURAL_DETECT"), None)
        assert breach is not None
        assert "Agent loop detected" in breach["action"]

        # Verify it only scanned the latest file (in this case only one exists)
        mock_client.models.generate_content.assert_called_once()

if __name__ == "__main__":
    pytest.main([__file__])
