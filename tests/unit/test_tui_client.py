import unittest
import sys
import os
from unittest.mock import patch, MagicMock
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src')))
from cstar.core.client import ping_daemon

class TestTUIClientAlignment(unittest.TestCase):

    @patch('socket.create_connection')
    def test_ping_daemon_raises_refusal(self, mock_create_connection):
        """Verify ping_daemon correctly raises ConnectionRefusedError when the daemon is offline."""
        mock_create_connection.side_effect = ConnectionRefusedError("Connection refused")
        
        with self.assertRaises(ConnectionRefusedError):
            ping_daemon(timeout=1.0)
            
    @patch('socket.create_connection')
    def test_ping_daemon_raises_timeout(self, mock_create_connection):
        """Verify ping_daemon correctly raises TimeoutError if the socket hangs."""
        mock_create_connection.side_effect = TimeoutError("Socket timeout")
        
        with self.assertRaises(TimeoutError):
            ping_daemon(timeout=0.5)

    @patch('socket.create_connection')
    def test_ping_daemon_success(self, mock_create_connection):
        """Verify ping_daemon passes implicitly when connection is successful."""
        mock_create_connection.return_value = MagicMock()
        try:
            ping_daemon(timeout=1.0)
        except Exception as e:
            self.fail(f"ping_daemon raised an exception unexpectedly: {e}")

if __name__ == '__main__':
    unittest.main()
