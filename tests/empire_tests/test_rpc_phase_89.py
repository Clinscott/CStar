import pytest

from src.cstar.core.rpc import LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR, SovereignRPC


def test_historical_rpc_phase_is_a_fail_closed_tombstone():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        SovereignRPC("synthetic")
