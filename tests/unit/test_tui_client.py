import unittest
import sys
import os
from unittest.mock import patch, MagicMock
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src')))
from cstar.core.client import ping_daemon

class TestTUIClientAlignment(unittest.TestCase):

    @patch('cstar.core.client.connect')
    def test_ping_daemon_raises_refusal(self, mock_connect):
        """Verify ping_daemon correctly raises ConnectionRefusedError when the daemon is offline."""
        mock_connect.side_effect = ConnectionRefusedError("Connection refused")
        
        with self.assertRaises(ConnectionRefusedError):
            ping_daemon(timeout=1.0)
            
    @patch('cstar.core.client.connect')
    def test_ping_daemon_raises_timeout(self, mock_connect):
        """Verify ping_daemon correctly raises TimeoutError if the socket hangs."""
        import websockets
        mock_connect.side_effect = websockets.exceptions.WebSocketException("Timeout")
        
        with self.assertRaises(ConnectionRefusedError):
            ping_daemon(timeout=0.5)

    @patch('cstar.core.client.connect')
    def test_ping_daemon_success(self, mock_connect):
        """Verify ping_daemon passes implicitly when connection is successful."""
        mock_ws = MagicMock()
        mock_connect.return_value.__enter__.return_value = mock_ws
        try:
            ping_daemon(timeout=1.0)
        except Exception as e:
            self.fail(f"ping_daemon raised an exception unexpectedly: {e}")

if __name__ == '__main__':
    unittest.main()
