import unittest
import asyncio
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch, AsyncMock

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.uplink import AntigravityUplink, clean_cli_output

class TestAntigravityUplink(unittest.IsolatedAsyncioTestCase):
    """Tier 1: Antigravity Uplink Protocol"""

    def test_ansi_stripping(self):
        """Verify that ANSI codes and spinners are removed correctly."""
        raw_input = "\x1B[31mError:\x1B[0m {\"response\": \"OK\"} \x1B[?25l|"
        expected = "{\"response\": \"OK\"}"
        self.assertEqual(clean_cli_output(raw_input).strip(), expected)

    def test_json_extraction_with_noise(self):
        """Verify that JSON can be extracted from surrounding CLI chatter."""
        chatter = (
            "Loaded cached credentials.\n"
            "Checking for updates...\n"
            "{\"status\": \"success\", \"response\": \"Hello\"}\n"
            "Finalizing session..."
        )
        expected = "{\"status\": \"success\", \"response\": \"Hello\"}"
        self.assertEqual(clean_cli_output(chatter).strip(), expected)

    async def test_payload_transmission(self):
        """Verify the uplink correctly transmits a query and parses the result."""
        uplink = AntigravityUplink()
        query = "Identify yourself."
        
        with patch('src.cstar.core.uplink.mimir.request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = SimpleNamespace(
                status="success",
                raw_text="I am ODIN",
                error=None,
                trace=SimpleNamespace(
                    correlation_id="uplink-success",
                    transport_mode="host_session",
                    cached=False,
                ),
            )
            
            response = await uplink.send_payload(query)
            self.assertEqual(response["status"], "success")
            self.assertEqual(response["data"]["raw"], "I am ODIN")
            self.assertEqual(response["trace"]["correlation_id"], "uplink-success")
            mock_request.assert_called_once()

    async def test_uplink_returns_canonical_error(self):
        """Verify the uplink returns the canonical bridge error when intelligence fails."""
        uplink = AntigravityUplink()
        
        with patch('src.cstar.core.uplink.mimir.request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = SimpleNamespace(
                status="error",
                raw_text=None,
                error="The One Mind returned no intelligence.",
                trace=SimpleNamespace(
                    correlation_id="uplink-error",
                    transport_mode="synapse_db",
                    cached=False,
                ),
            )

            response = await uplink.send_payload("Hello")
            self.assertEqual(response["status"], "error")
            self.assertIn("no intelligence", response["message"])
            self.assertEqual(response["trace"]["transport_mode"], "synapse_db")
            mock_request.assert_called_once()

if __name__ == '__main__':
    unittest.main()
