import pytest

from src.core.cstar_dispatcher import (
    LEGACY_PYTHON_CSTAR_DISPATCHER_ERROR,
    CorvusDispatcher,
)


def test_python_dispatcher_discovery_is_retired() -> None:
    dispatcher = object.__new__(CorvusDispatcher)

    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_CSTAR_DISPATCHER_ERROR}$"):
        dispatcher._discover_all()
