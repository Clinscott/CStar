import pytest

from src.tools.data.overfit_corrections import overfit


def test_correction_overfit_is_retired() -> None:
    with pytest.raises(
        RuntimeError,
        match="^legacy_python_vector_scan_caller_retired_use_cstar_validation$",
    ):
        overfit()
