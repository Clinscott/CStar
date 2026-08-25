import pytest

from src.cstar.core.rpc import LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR, SovereignRPC


def test_direct_python_rpc_projection_is_retired():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        SovereignRPC("synthetic")
