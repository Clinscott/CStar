import pytest

from src.core.engine.wardens.norn import (
    LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR,
    NornWarden,
)


def test_direct_norn_warden_is_retired_before_hall_or_projection_access():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        NornWarden("synthetic")
