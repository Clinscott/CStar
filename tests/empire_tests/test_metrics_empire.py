import pytest

from src.core.metrics import LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR, ProjectMetricsEngine


def test_project_metrics_engine_is_a_fail_closed_tombstone():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR}$"):
        ProjectMetricsEngine()
