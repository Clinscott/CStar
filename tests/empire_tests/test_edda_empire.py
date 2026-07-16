import pytest

from src.core.edda import LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR, EddaWeaver


def test_edda_transmuter_is_retired_before_filesystem_access():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        EddaWeaver("synthetic", "synthetic")
