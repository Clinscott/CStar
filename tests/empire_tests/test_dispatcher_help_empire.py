import pytest

from src.core.cstar_dispatcher import (
    LEGACY_PYTHON_CSTAR_DISPATCHER_ERROR,
    CorvusDispatcher,
)


class TestCorvusDispatcher:
    def test_constructor_is_retired(self) -> None:
        with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_CSTAR_DISPATCHER_ERROR}$"):
            CorvusDispatcher()

    def test_help_is_retired(self) -> None:
        dispatcher = object.__new__(CorvusDispatcher)

        with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_CSTAR_DISPATCHER_ERROR}$"):
            dispatcher.show_help()
