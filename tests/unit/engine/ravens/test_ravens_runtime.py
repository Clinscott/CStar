import pytest

from src.core.engine.ravens.ravens_runtime import (
    LEGACY_PYTHON_RAVENS_ENGINE_ERROR,
    execute_ravens_cycle,
    execute_ravens_cycle_contract,
)


@pytest.mark.asyncio
@pytest.mark.parametrize("invoke", [execute_ravens_cycle, execute_ravens_cycle_contract])
async def test_ravens_runtime_fails_before_provider_or_cycle(invoke):
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        await invoke("synthetic")
