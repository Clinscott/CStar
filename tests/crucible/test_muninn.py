
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

from src.cstar.core.daemon import process_command, engine_search_sync

class TestMuninnDaemon(unittest.IsolatedAsyncioTestCase):
    """Tier 2: Muninn Daemon Loop"""

    async def test_deterministic_command_routing(self):
        """Verify that known commands are routed to their target workflows."""
        # Mock both the registry and the ENGINE to bypass vector search
        with patch('src.cstar.core.daemon.COMMAND_REGISTRY', {'test_cmd': 'test_path.py'}), \
             patch('src.cstar.core.daemon.ENGINE') as mock_engine:
             
            # Simulate a query where the command is 'test_cmd'
            res, top, score = engine_search_sync("test_cmd")
            self.assertIsNotNone(res)
            self.assertEqual(res["status"], "success")
            self.assertEqual(res["type"], "deterministic")
            self.assertEqual(res["target"], "test_path.py")

    async def test_uplink_fallback_on_low_confidence(self):
        """Verify that low-confidence queries trigger an Alfred Uplink request."""
        with patch('src.cstar.core.daemon.engine_search_sync', return_value=(None, None, 0.1)), \
             patch('src.cstar.core.daemon.UPLINK.send_payload', new_callable=AsyncMock) as mock_uplink:
            
            mock_uplink.return_value = {"status": "success", "data": {"raw": "Thinking..."}}
            response = await process_command("What is the meaning of life?", [], ".")
            self.assertEqual(response["status"], "uplink_success")
            mock_uplink.assert_called_once()

    async def test_sleep_protocol_persistence(self):
        """Verify the sleep protocol persists session traces correctly."""
        from src.cstar.core.daemon import execute_sleep_protocol
        with patch('src.cstar.core.daemon.SESSION_TRACES', [{"test": "data"}]), \
             patch('pathlib.Path.write_text') as mock_write, \
             patch('subprocess.Popen'):
             
            await execute_sleep_protocol()
            mock_write.assert_called_once()
            self.assertIn('"test": "data"', mock_write.call_args[0][0])

if __name__ == '__main__':
    unittest.main()
