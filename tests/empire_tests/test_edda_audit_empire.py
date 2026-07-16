import pytest

from src.core.engine.wardens.edda import (
    LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR,
    EddaWarden,
)


def test_recursive_edda_warden_is_retired_before_source_reads():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        EddaWarden("synthetic")
