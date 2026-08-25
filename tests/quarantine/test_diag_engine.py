import pytest

from src.tools.debug.diag_engine import run_diag


def test_diagnostic_engine_is_retired() -> None:
    with pytest.raises(
        RuntimeError,
        match="^legacy_python_vector_scan_caller_retired_use_cstar_validation$",
    ):
        run_diag()
