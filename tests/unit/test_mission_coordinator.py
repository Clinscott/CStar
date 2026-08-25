import pytest

from src.core.engine.ravens.coordinator import (
    LEGACY_PYTHON_RAVENS_ENGINE_ERROR,
    MissionCoordinator,
)


def test_mission_priority_parser_does_not_mutate_input():
    breaches = [{"severity": "LOW"}, {"severity": "CRITICAL"}]
    assert MissionCoordinator._legacy_sort(breaches) == {"severity": "CRITICAL"}
    assert breaches == [{"severity": "LOW"}, {"severity": "CRITICAL"}]


def test_direct_coordinator_fails_closed():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        MissionCoordinator("synthetic")
