import pytest

from src.core.engine.ravens.score_cohesion import (
    LEGACY_PYTHON_RAVENS_ENGINE_ERROR,
    CohesionScorer,
)


def test_cohesion_scorer_is_retired_before_provider_or_score():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        CohesionScorer()
