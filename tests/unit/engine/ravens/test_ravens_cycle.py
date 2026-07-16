import pytest

from src.core.engine.ravens.ravens_cycle import LEGACY_PYTHON_RAVENS_ENGINE_ERROR, main


def test_ravens_cycle_cli_is_retired():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        main()
