import pytest

from src.tools.debug.debug_perf import run_profile


def test_debug_profile_is_retired() -> None:
    with pytest.raises(
        RuntimeError,
        match="^legacy_python_vector_scan_caller_retired_use_cstar_validation$",
    ):
        run_profile()
