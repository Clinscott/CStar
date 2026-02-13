import pytest
from unittest.mock import MagicMock, patch
from src.sentinel.muninn import run, Muninn

def test_muninn_run_instantiation():
    """
    Verifies that run() instantiates Muninn and not SovereignFish.
    """
    target_path = "."
    
    # Mock Muninn class and its run method
    with patch("src.sentinel.muninn.Muninn") as MockMuninn:
        mock_instance = MockMuninn.return_value
        mock_instance.run.return_value = True
        
        # Call the run function
        result = run(target_path)
        
        # Verify Muninn was called with target_path
        MockMuninn.assert_called_once_with(target_path)
        # Verify run was called on the instance
        mock_instance.run.assert_called_once()
        assert result is True

def test_muninn_initialization_failure():
    """
    Verifies that run() handles initialization failure gracefully.
    """
    target_path = "."
    
    with patch("src.sentinel.muninn.Muninn") as MockMuninn:
        MockMuninn.side_effect = Exception("Initialization Failed")
        
        # Should return False and not raise NameError
        result = run(target_path)
        assert result is False
