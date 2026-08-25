import pytest

from src.core.engine.ravens.coordinator import (
    LEGACY_PYTHON_RAVENS_ENGINE_ERROR,
    MissionCoordinator,
)


def test_detached_score_parser_remains_pure():
    metrics = {"logic": 0.7, "stability": 0.9}
    assert MissionCoordinator._initial_score_from_metrics("LOGIC", metrics) == 0.7
    assert MissionCoordinator._initial_score_from_metrics("STABILITY", metrics) == 9.0


def test_direct_mission_coordinator_is_retired():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        MissionCoordinator("synthetic")
