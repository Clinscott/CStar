import pytest

from src.tools.debug.debug_fishtest import run_debug_fishtest


def test_debug_fishtest_is_retired() -> None:
    with pytest.raises(
        RuntimeError,
        match="^legacy_python_vector_scan_caller_retired_use_cstar_validation$",
    ):
        run_debug_fishtest("/synthetic/data.json")
