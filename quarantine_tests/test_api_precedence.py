import unittest
import asyncio
import os
import sys
from unittest.mock import patch, AsyncMock, MagicMock
from pathlib import Path

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.antigravity_bridge import process_request
from src.cstar.core.uplink import AntigravityUplink

class TestAPIKeyPrecedence(unittest.IsolatedAsyncioTestCase):
    """
    Tier 2: API Key Precedence and Fallback Tests
    Verifies the "CLI first, Env Var last" logic.
    """

    @patch('asyncio.create_subprocess_shell')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='{"status": "success", "response": "ok"}')
    @patch('src.cstar.core.antigravity_bridge.clean_cli_output', return_value='{"status": "success", "response": "ok"}')
    async def test_bridge_unsets_env_vars_when_no_api_key(self, mock_clean, mock_open, mock_subproc):
        """Verify that the bridge unsets API key env vars when no key is provided."""
        mock_proc = AsyncMock()
        mock_proc.wait = AsyncMock(return_value=0)
        mock_proc.returncode = 0
        mock_subproc.return_value = mock_proc

        # Call process_request without an api_key
        await process_request("test query", "ODIN", api_key=None)

        # Check the environment passed to the subprocess
        env = mock_subproc.call_args.kwargs['env']
        self.assertNotIn("GEMINI_API_KEY", env)
        self.assertNotIn("GOOGLE_API_KEY", env)

    @patch('asyncio.create_subprocess_shell')
    @patch('builtins.open', new_callable=unittest.mock.mock_open, read_data='{"status": "success", "response": "ok"}')
    @patch('src.cstar.core.antigravity_bridge.clean_cli_output', return_value='{"status": "success", "response": "ok"}')
    async def test_bridge_sets_env_vars_when_api_key_provided(self, mock_clean, mock_open, mock_subproc):
        """Verify that the bridge sets API key env vars when a key is provided."""
        mock_proc = AsyncMock()
        mock_proc.wait = AsyncMock(return_value=0)
        mock_proc.returncode = 0
        mock_subproc.return_value = mock_proc

        # Call process_request with an api_key
        await process_request("test query", "ODIN", api_key="secret_key")

        # Check the environment passed to the subprocess
        env = mock_subproc.call_args.kwargs['env']
        self.assertEqual(env["GEMINI_API_KEY"], "secret_key")
        self.assertEqual(env["GOOGLE_API_KEY"], "secret_key")

    async def test_uplink_fallback_logic(self):
        """Verify that the uplink retries with env var if the first pass fails with AUTH_REQUIRED."""
        uplink = AntigravityUplink()
        
        # We'll mock _transmit_socket to return AUTH_REQUIRED on the first call
        # and success on the second call.
        with patch.object(uplink, '_transmit_socket', new_callable=AsyncMock) as mock_transmit:
            mock_transmit.side_effect = [
                {"status": "error", "code": "AUTH_REQUIRED", "message": "Auth failed"},
                {"status": "success", "data": {"raw": "recovered"}}
            ]
            
            with patch.dict(os.environ, {"GEMINI_API_KEY": "env_secret"}):
                result = await uplink.send_payload("test query")
                
                # Verify two calls were made
                self.assertEqual(mock_transmit.call_count, 2)
                
                # First call should have had api_key=None
                self.assertIsNone(mock_transmit.call_args_list[0][0][0]["api_key"])
                
                # Second call should have had api_key="env_secret"
                self.assertEqual(mock_transmit.call_args_list[1][0][0]["api_key"], "env_secret")
                
                self.assertEqual(result["status"], "success")

    async def test_uplink_no_fallback_if_init_key_provided(self):
        """Verify that the uplink does NOT fallback if an explicit key was provided in __init__."""
        uplink = AntigravityUplink(api_key="explicit_key")
        
        with patch.object(uplink, '_transmit_socket', new_callable=AsyncMock) as mock_transmit:
            mock_transmit.return_value = {"status": "error", "code": "AUTH_REQUIRED"}
            
            result = await uplink.send_payload("test query")
            
            # Verify only one call was made (since api_key was not None)
            self.assertEqual(mock_transmit.call_count, 1)
            self.assertEqual(mock_transmit.call_args[0][0]["api_key"], "explicit_key")

if __name__ == '__main__':
    unittest.main()
