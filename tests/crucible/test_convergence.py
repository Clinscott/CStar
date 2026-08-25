import pytest

from src.cstar.core.uplink import (
    LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR,
    AntigravityUplink,
)


def test_direct_synaptic_convergence_path_is_retired():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        AntigravityUplink()
