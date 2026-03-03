import sys
from pathlib import Path
_PROJECT_ROOT = Path(r"C:\Users\Craig\Corvus\CorvusStar").resolve()
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

I will provide the pytest reproduction code that checks for missing docstrings in `src/core/metrics.py` as a code block, since I am currently in a restricted mode without file-writing capabilities.

import inspect
import pytest
from src.core.metrics import ExecutionTracker, ProjectMetricsEngine

def test_execution_tracker_docstrings():
    """Ensure ExecutionTracker and its methods have docstrings."""
    assert ExecutionTracker.__doc__ is not None, "ExecutionTracker class missing docstring"

    methods = [
        "__init__",
        "__enter__",
        "__exit__",
        "latency_ms",
        "mem_delta_mb",
        "report",
        "track"
    ]

    for method_name in methods:
        method = getattr(ExecutionTracker, method_name)
        # Handle properties
        if isinstance(method, property):
            doc = method.__doc__
        else:
            doc = method.__doc__

        assert doc is not None, f"ExecutionTracker.{method_name} missing docstring"

def test_project_metrics_engine_docstrings():
    """Ensure ProjectMetricsEngine and its methods have docstrings."""
    assert ProjectMetricsEngine.__doc__ is not None, "ProjectMetricsEngine class missing docstring"

    methods = [
        "__init__",
        "compute"
    ]

    for method_name in methods:
        method = getattr(ProjectMetricsEngine, method_name)
        assert method.__doc__ is not None, f"ProjectMetricsEngine.{method_name} missing docstring"
I have also drafted the updated `src/core/metrics.py` with the missing docstrings:

# src/core/metrics.py (Updated with docstrings)

# ... (imports)

class ExecutionTracker:
    """
    Decoupled Metrics Tracker.
    Tracks pure latency using perf_counter.
    Memory profiling (psutil) is only sampled at explicit start/end bounds
    to prevent Observer Effect latency inflation.
    """
    def __init__(self, name: str):
        """Initializes the execution tracker with a specific operation name."""
        self.name = name
        # ...

    def __enter__(self):
        """Starts the timer and samples initial memory usage."""
        # ...

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Stops the timer and samples final memory usage."""
        # ...

    @property
    def latency_ms(self) -> float:
        """Returns the execution latency in milliseconds."""
        return (self.end_time - self.start_time) * 1000

    @property
    def mem_delta_mb(self) -> float:
        """Returns the memory usage change in megabytes."""
        return self.end_mem - self.start_mem

    def report(self) -> dict[str, Any]:
        """Generates a summary dictionary of the tracked metrics."""
        return {
            # ...
        }

    # ... (track decorator)

class ProjectMetricsEngine:
    # ...
    def __init__(self, weights_path: str = "src/core/weights.json") -> None:
        """Initializes the metrics engine and loads configuration weights."""
        # ...
