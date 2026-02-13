import pytest
import unittest.mock as mock
from src.tools.latency_check import LatencyProfiler

def test_latency_profiler_startup():
    with mock.patch("subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        
        profiler = LatencyProfiler(iterations=2)
        avg = profiler.measure_startup()
        
        assert mock_run.call_count == 2
        assert avg > 0
        assert avg < 10000

def test_latency_profiler_search():
    with mock.patch("subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        
        profiler = LatencyProfiler(iterations=2)
        avg = profiler.measure_search("test query")
        
        assert mock_run.call_count == 2
        assert avg > 0
        assert avg < 5000

def test_latency_profiler_failure():
    with mock.patch("subprocess.run") as mock_run:
        import subprocess
        mock_run.side_effect = subprocess.SubprocessError()
        
        profiler = LatencyProfiler(iterations=1)
        avg = profiler.measure_startup()
        
        # Should return penalty value
        assert avg == 10000.0
