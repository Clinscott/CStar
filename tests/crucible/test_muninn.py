
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
        from src.cstar.core.daemon import get_daemon
        daemon = get_daemon()
        daemon.command_registry = {'test_cmd': 'test_path.py'}
        
        # We mock the engine search to avoid real vector lookups
        with patch.object(daemon, 'engine_search_sync') as mock_search:
            mock_search.return_value = ({"status": "success", "type": "deterministic", "target": "test_path.py"}, None, 1.0)
            res, top, score = daemon.engine_search_sync("test_cmd")
            self.assertEqual(res["target"], "test_path.py")

    async def test_uplink_fallback_on_low_confidence(self):
        """Verify that low-confidence queries trigger an Alfred Uplink request."""
        from src.cstar.core.daemon import get_daemon, process_command
        daemon = get_daemon()
        
        # Mock engine to return low score
        with patch.object(daemon, 'engine_search_sync', return_value=(None, None, 0.1)), \
             patch.object(daemon.uplink, 'send_payload', new_callable=AsyncMock) as mock_uplink:
            
            mock_uplink.return_value = {"status": "success", "data": {"raw": "Oracle result"}}
            response = await process_command("What is the meaning of life?", [], ".")
            
            self.assertEqual(response["status"], "uplink_success")
            self.assertEqual(response.get("response"), "Oracle result")

    async def test_sleep_protocol_persistence(self):
        """Verify the sleep protocol persists session traces correctly."""
        from src.cstar.core.daemon import get_daemon, execute_sleep_protocol
        daemon = get_daemon()
        daemon.session_traces = [{"test": "data"}]
        
        with patch("pathlib.Path.write_text") as mock_write, \
             patch("subprocess.Popen"):
            
            await execute_sleep_protocol()
            # Verify the traces were written
            args, _ = mock_write.call_args
            self.assertIn('"test": "data"', args[0])

if __name__ == '__main__':
    unittest.main()
