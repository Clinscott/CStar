import pytest

from src.core.engine.executor import (
    LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR,
    SovereignExecutor,
)


@pytest.mark.parametrize(
    "method",
    ["handle_proactive", "suggest_forge", "handle_cortex_query"],
)
def test_retired_executor_rejects_every_action(method):
    executor = object.__new__(SovereignExecutor)
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR}$"):
        getattr(executor, method)(object())
