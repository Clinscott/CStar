import pytest

from src.tools.debug.debug_engine import debug_query


def test_debug_engine_is_retired() -> None:
    with pytest.raises(
        RuntimeError,
        match="^legacy_python_vector_scan_caller_retired_use_cstar_validation$",
    ):
        debug_query("synthetic")
