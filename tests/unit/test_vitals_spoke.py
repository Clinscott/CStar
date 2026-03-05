import pytest
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from src.core.vitals_spoke import get_vitals

def test_get_vitals_success():
    # Mock SovereignRPC
    with patch("src.core.vitals_spoke.SovereignRPC") as mock_rpc_class:
        mock_rpc = MagicMock()
        mock_rpc.get_dashboard_state.return_value = {"status": "OK", "tasks": []}
        mock_rpc_class.return_value = mock_rpc
        
        res = get_vitals()
        
        assert res["status"] == "OK"
        mock_rpc.get_dashboard_state.assert_called_once()

def test_get_vitals_error():
    with patch("src.core.vitals_spoke.SovereignRPC") as mock_rpc_class:
        mock_rpc = MagicMock()
        mock_rpc.get_dashboard_state.side_effect = Exception("RPC Failure")
        mock_rpc_class.return_value = mock_rpc
        
        res = get_vitals()
        
        assert "error" in res
        assert res["error"] == "RPC Failure"
