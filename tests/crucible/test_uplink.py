
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

from src.cstar.core.uplink import AntigravityUplink

class TestAntigravityUplink(unittest.IsolatedAsyncioTestCase):
    """Tier 1: Antigravity Uplink Protocol"""

    async def test_payload_structure(self):
        """Verify the uplink correctly formats the outgoing JSON payload."""
        uplink = AntigravityUplink(api_key="test_key")
        query = "Identify yourself."
        context = {"persona": "ODIN"}
        
        # We mock the actual transmission to check the payload
        with patch.object(uplink, '_transmit_socket', new_callable=AsyncMock) as mock_transmit:
            mock_transmit.return_value = {"status": "success"}
            await uplink.send_payload(query, context)
            
            payload = mock_transmit.call_args[0][0]
            self.assertEqual(payload["query"], query)
            self.assertEqual(payload["context"]["persona"], "ODIN")
            self.assertEqual(payload["api_key"], "test_key")
            self.assertEqual(payload["source"], "cstar_cli")

    async def test_bridge_offline_fallback(self):
        """Verify the uplink returns a graceful fallback when the bridge is offline."""
        uplink = AntigravityUplink()
        
        # Simulate a connection refusal
        with patch('asyncio.open_connection', side_effect=ConnectionRefusedError()):
            response = await uplink.send_payload("Hello")
            self.assertEqual(response["status"], "error")
            self.assertIn("Bridge Offline", response["message"])

if __name__ == '__main__':
    unittest.main()
