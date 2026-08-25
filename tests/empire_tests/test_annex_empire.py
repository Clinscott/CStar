import pytest

from src.core.annex import LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR, HeimdallWarden


def test_annex_scanner_is_retired_before_source_or_plan_access():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        HeimdallWarden("synthetic")
