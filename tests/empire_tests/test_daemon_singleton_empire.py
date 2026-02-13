import pytest
import os
from pathlib import Path
from unittest.mock import patch, MagicMock
import sys

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

# Import the module to test
from src.sentinel.main_loop import daemon_loop

def test_daemon_singleton_lock_creation(tmp_path):
    """
    Verifies that daemon_loop creates a lock file and writes its PID.
    """
    lock_file = tmp_path / "ravens.lock"
    
    # Mock Path.unlink and other dependencies
    with patch("src.sentinel.main_loop.load_config", return_value={"persona": "ODIN"}), \
         patch("src.sentinel.main_loop.HUD"), \
         patch("src.sentinel.main_loop.load_target_repos", return_value=[]), \
         patch("src.sentinel.main_loop.psutil"), \
         patch("src.sentinel.main_loop.highlander_check", return_value=False), \
         patch("src.sentinel.main_loop.Path.unlink") as mock_unlink: 
        
        # Run the loop with our temp lock file
        daemon_loop(lock_file)
        
        # Verify lock file was written
        assert lock_file.exists()
        assert lock_file.read_text().strip() == str(os.getpid())
        
        # Verify it was unlinked at the end (the mock was called)
        assert mock_unlink.called

def test_daemon_detects_existing_lock(tmp_path):
    """
    Verifies that daemon_loop detects an existing running process and exits.
    """
    lock_file = tmp_path / "ravens.lock"
    existing_pid = 1234
    lock_file.write_text(str(existing_pid))
    
    with patch("src.sentinel.main_loop.psutil") as mock_psutil, \
         patch("src.sentinel.main_loop.load_config", return_value={"persona": "ODIN"}), \
         patch("src.sentinel.main_loop.HUD"):
        
        mock_psutil.pid_exists.return_value = True
        
        # Should print error and return early
        with patch("builtins.print") as mock_print:
            daemon_loop(lock_file)
            # Find the error message in any of the print calls
            args_list = [call.args[0] for call in mock_print.call_args_list]
            assert any("[ERROR] The Ravens are already in flight" in arg for arg in args_list)
            
        # Verify lock was not overwritten
        assert lock_file.read_text().strip() == str(existing_pid)
