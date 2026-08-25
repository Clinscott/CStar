import pytest

from src.core.engine.evolve_skill import (
    LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR,
    _improve_scores,
    execute_evolve,
    execute_evolve_promotion,
)


def test_detached_score_preview_is_not_evidence_and_does_not_mutate_input():
    baseline = {"logic": 1.0, "overall": 2.0}
    preview = _improve_scores(baseline, ["logic"])
    assert baseline == {"logic": 1.0, "overall": 2.0}
    assert preview == {"logic": 1.2, "overall": 2.1}


@pytest.mark.parametrize(
    "invoke",
    [lambda: execute_evolve("synthetic"), lambda: execute_evolve_promotion("synthetic", proposal_id="p")],
)
def test_direct_evolve_lifecycle_is_retired(invoke):
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR}$"):
        invoke()
