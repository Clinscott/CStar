import pytest

from src.core.engine.ravens.muninn_memory import (
    LEGACY_PYTHON_RAVENS_ENGINE_ERROR,
    MuninnMemory,
)


@pytest.mark.parametrize(
    "method",
    [
        "repo_id",
        "load_ledger",
        "record_stage_observation",
        "record_trace",
        "log_cycle_completion",
        "sync_intent_integrity_from_sprt",
    ],
)
def test_muninn_memory_methods_fail_before_hall_or_files(method):
    memory = object.__new__(MuninnMemory)
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        getattr(memory, method)()
