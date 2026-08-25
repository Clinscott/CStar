import pytest

from src.core.engine.ravens.muninn_hunter import (
    LEGACY_PYTHON_RAVENS_ENGINE_ERROR,
    MuninnHunter,
)


def test_muninn_hunter_is_retired_before_hall_or_source_scan():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        MuninnHunter("synthetic", object())
