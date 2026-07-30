import pytest

from src.core.norn_coordinator import (
    LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR,
    NornCoordinator,
)


def test_direct_norn_lifecycle_coordinator_is_retired():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        NornCoordinator("synthetic")
