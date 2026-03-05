import unittest
import asyncio
import json
import os
import sys
from pathlib import Path
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
        
        # We mock mimir.think to avoid real MCP calls
        with patch('src.cstar.core.uplink.mimir.think', new_callable=AsyncMock) as mock_think:
            mock_think.return_value = "I am ODIN"
            
            response = await uplink.send_payload(query)
            self.assertEqual(response["status"], "success")
            self.assertEqual(response["data"]["raw"], "I am ODIN")
            mock_think.assert_called_once()

    async def test_uplink_silence_fallback(self):
        """Verify the uplink returns a graceful failure when no JSON is detected."""
        uplink = AntigravityUplink()
        
        # We mock mimir.think to return None to trigger the Direct Strike fallback
        with patch('src.cstar.core.uplink.mimir.think', new_callable=AsyncMock) as mock_think:
            mock_think.return_value = None
            
            # Now mock the entire shell execution for fallback
            with patch('asyncio.create_subprocess_shell') as mock_proc:
                mock_sub = AsyncMock()
                mock_sub.wait = AsyncMock(return_value=0)
                mock_proc.return_value = mock_sub
                
                with patch('src.cstar.core.uplink.Path.read_text', return_value='The void is silent.'):
                    response = await uplink.send_payload("Hello")
                    self.assertEqual(response["status"], "error")
                    self.assertIn("Oracle Silence", response["message"])

if __name__ == '__main__':
    unittest.main()
