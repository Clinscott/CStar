import sys
from pathlib import Path
_PROJECT_ROOT = Path(r"C:\Users\Craig\Corvus\CorvusStar").resolve()
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

// Corvus Star Trace
Intent: Forge the reproduction runes for the missing Intel (docstrings) in the Metrics Spoke.
Logic: [L] Logic -> [I] Intel -> [V] Vigil (Verification)
State: Restricted Sector (Sterile Mode detected). Modification tools are suppressed.
Confidence: 0.9 (Forge ready, but tools are locked)

The system is in a Restricted State (Sterile Mode), likely due to the `.corvus_quarantine` or `sterileAgent` sectors. My forge tools (`write_file`, `run_shell_command`) are unavailable. I provide the reproduction code and the corrected module logic below for your manual strike.

### 🔱 Pytest Reproduction Code

Place this in `tests/repro_missing_docstring.py`:

import inspect
import pytest
import src.core.metrics as metrics

def test_module_has_docstring():
    """Verify that the metrics module has a docstring."""
    assert metrics.__doc__ is not None, "Module src/core/metrics.py is missing a docstring."
    assert len(metrics.__doc__.strip()) > 0, "Module src/core/metrics.py has an empty docstring."

@pytest.mark.parametrize("method_name", [
    "__init__",
    "__enter__",
    "__exit__",
    "latency_ms",
    "mem_delta_mb",
    "report"
])
def test_execution_tracker_members_have_docstrings(method_name):
    """Verify that key members in ExecutionTracker have docstrings."""
    member = getattr(metrics.ExecutionTracker, method_name)
    doc = inspect.getdoc(member)
    assert doc is not None and len(doc.strip()) > 0, f"ExecutionTracker.{method_name} is missing a docstring."

@pytest.mark.parametrize("method_name", [
    "__init__"
])
def test_project_metrics_engine_members_have_docstrings(method_name):
    """Verify that key members in ProjectMetricsEngine have docstrings."""
    member = getattr(metrics.ProjectMetricsEngine, method_name)
    doc = inspect.getdoc(member)
    assert doc is not None and len(doc.strip()) > 0, f"ProjectMetricsEngine.{method_name} is missing a docstring."
### 🔱 Fixed Code for src/core/metrics.py

Add the following docstrings to the module:

"""
Core Metrics Engine for Corvus Star.
Provides decoupled performance tracking and Global Project Health Score (GPHS) calculations.
"""

import json
# ... (existing imports)

class ExecutionTracker:
    # ...
    def __init__(self, name: str):
        """Initialize the ExecutionTracker with an operation name."""
        self.name = name
        # ...

    def __enter__(self):
        """Capture the starting memory and precise time before operation execution."""
        # ...

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Capture the ending memory and precise time after operation completion."""
        # ...

    @property
    def latency_ms(self) -> float:
        """Calculate the execution latency in milliseconds."""
        return (self.end_time - self.start_time) * 1000

    @property
    def mem_delta_mb(self) -> float:
        """Calculate the memory usage change in megabytes."""
        return self.end_mem - self.start_mem

    def report(self) -> dict[str, Any]:
        """Return a structured dictionary containing all captured metrics."""
        # ...

class ProjectMetricsEngine:
    # ...
    def __init__(self, weights_path: str = "src/core/weights.json") -> None:
        """
        Initialize the Metrics Engine.
        Loads metric weights from the specified JSON path or uses default Gungnir values.
        """
        # ...
BY MY WILL, THE SYSTEM IS FORGED. DEVIATION IS DEFEAT.
