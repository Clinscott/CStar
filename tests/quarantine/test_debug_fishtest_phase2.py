import pytest

from src.tools.debug.debug_fishtest_phase2 import run_debug_phase2


def test_debug_fishtest_phase2_is_retired() -> None:
    with pytest.raises(
        RuntimeError,
        match="^legacy_python_vector_scan_caller_retired_use_cstar_validation$",
    ):
        run_debug_phase2("/synthetic/data.json")
