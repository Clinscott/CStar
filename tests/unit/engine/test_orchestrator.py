import pytest

from src.core.engine.orchestrator import (
    LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR,
    SovereignOrchestrator,
)


@pytest.mark.parametrize(
    "invoke",
    [
        lambda: SovereignOrchestrator(None, None, {}, {}),
        lambda: SovereignOrchestrator.execute_search(object.__new__(SovereignOrchestrator)),
        lambda: SovereignOrchestrator.web_fallback(object.__new__(SovereignOrchestrator)),
        lambda: SovereignOrchestrator.create_payload(object.__new__(SovereignOrchestrator)),
    ],
)
def test_retired_orchestrator_fails_closed(invoke):
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR}$"):
        invoke()
