import pytest

from src.core.engine.atomic_gpt import (
    LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR,
    AnomalyWarden,
    SessionWarden,
    main,
)


@pytest.mark.parametrize("invoke", [AnomalyWarden, SessionWarden, main])
def test_retired_neural_wardens_fail_before_model_state(invoke):
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR}$"):
        invoke()
