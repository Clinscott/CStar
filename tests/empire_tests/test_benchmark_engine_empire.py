import pytest
import unittest.mock as mock
from src.tools.benchmark_engine import benchmark

def test_benchmark_logic():
    # Mock subprocess.run to simulate sv_engine execution
    with mock.patch("subprocess.run") as mock_run:
        mock_run.return_value.stdout = b"ok"
        
        # Mock ReportEngine to avoid writing files
        with mock.patch("src.tools.benchmark_engine.ReportEngine") as mock_engine:
            instance = mock_engine.return_value
            instance.generate_report.return_value = "Mock Report"
            
            # Run a small benchmark (3 trials)
            benchmark(n=3)
            
            assert mock_run.call_count == 3
            assert instance.generate_report.called
