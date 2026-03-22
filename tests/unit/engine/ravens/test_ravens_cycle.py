import pytest
import sys
import json
from unittest.mock import MagicMock, patch, AsyncMock
from pathlib import Path
from src.core.engine.ravens.ravens_cycle import main
from src.core.engine.ravens_stage import RavensCycleResult

def test_ravens_cycle_main():
    mock_result = RavensCycleResult(status="SUCCESS", metrics={"test": 1.0})
    
    with patch("argparse.ArgumentParser.parse_args") as mock_args, \
         patch("src.core.engine.ravens.ravens_cycle.execute_ravens_cycle_contract", new_callable=AsyncMock) as mock_execute, \
         patch("src.core.engine.ravens.ravens_cycle.asyncio.run") as mock_async_run, \
         patch("builtins.print") as mock_print:
        
        mock_args.return_value = MagicMock(project_root="/tmp/root")
        mock_async_run.return_value = mock_result
        
        main()
        
        mock_async_run.assert_called_once()
        mock_print.assert_called_once()
        
        # Verify printed JSON contains expected status
        printed_arg = mock_print.call_args[0][0]
        printed_data = json.loads(printed_arg)
        assert printed_data["status"] == "SUCCESS"
        assert printed_data["metrics"]["test"] == 1.0
