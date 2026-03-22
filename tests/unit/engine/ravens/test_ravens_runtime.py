import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.core.engine.ravens.ravens_runtime import execute_ravens_cycle_contract, execute_ravens_cycle
from src.core.engine.ravens_stage import RavensCycleResult

@pytest.mark.asyncio
async def test_execute_ravens_cycle_contract():
    project_root = "/tmp/test_project"
    
    with patch("src.core.engine.ravens.ravens_runtime.AntigravityUplink") as MockUplink, \
         patch("src.core.engine.ravens.ravens_runtime.MuninnHeart") as MockHeart:
        
        mock_heart_instance = MockHeart.return_value
        mock_result = RavensCycleResult(status="SUCCESS", metrics={})
        mock_heart_instance.execute_cycle_contract.return_value = mock_result
        
        result = await execute_ravens_cycle_contract(project_root)
        
        assert result == mock_result
        MockHeart.assert_called_once()
        mock_heart_instance.execute_cycle_contract.assert_called_once()

@pytest.mark.asyncio
async def test_execute_ravens_cycle():
    project_root = "/tmp/test_project"
    
    with patch("src.core.engine.ravens.ravens_runtime.execute_ravens_cycle_contract") as mock_execute:
        mock_result = RavensCycleResult(status="SUCCESS", metrics={})
        mock_execute.return_value = mock_result
        
        success = await execute_ravens_cycle(project_root)
        assert success is True
        
        mock_result.status = "FAILURE"
        success = await execute_ravens_cycle(project_root)
        assert success is False
