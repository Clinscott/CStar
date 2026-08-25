import pytest

from src.tools.debug.verify_fish import verify_system_integrity


def test_verify_system_integrity_is_retired():
    error = "legacy_python_ravens_engine_retired_use_cstar_kernel"
    with pytest.raises(RuntimeError, match=f"^{error}$"):
        verify_system_integrity()
