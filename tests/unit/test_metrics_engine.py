import pytest

from src.core.metrics import (
    LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR,
    ExecutionTracker,
    ProjectMetricsEngine,
)


@pytest.mark.parametrize("invoke", [lambda: ExecutionTracker("x"), ProjectMetricsEngine])
def test_retired_python_metrics_fail_before_process_or_score(invoke):
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR}$"):
        invoke()
