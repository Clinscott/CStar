import pytest

from src.core import sv_engine


def test_retired_engine_has_no_stateful_teardown_lifecycle() -> None:
    with pytest.raises(RuntimeError, match=f"^{sv_engine.RETIREMENT_ERROR}$"):
        sv_engine.SovereignEngine()
