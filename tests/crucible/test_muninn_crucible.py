import pytest

from src.core.engine.forge_candidate import GeneratedTestArtifact
from src.core.engine.ravens.muninn_crucible import (
    LEGACY_PYTHON_RAVENS_ENGINE_ERROR,
    MuninnCrucible,
)


def test_validation_request_coercion_is_detached_and_pure():
    request = MuninnCrucible._coerce_validation_request(
        {
            "bead_id": "bead:test",
            "candidate_id": "candidate:test",
            "repo_id": "repo:test",
            "scan_id": "scan:test",
            "target_path": "src/example.py",
            "staged_path": "staged/example.py",
            "generated_tests": [
                GeneratedTestArtifact(path="tests/test_example.py", reason="synthetic").to_dict()
            ],
        }
    )
    assert request.bead_id == "bead:test"
    assert request.generated_tests[0].reason == "synthetic"


def test_crucible_constructor_is_retired_before_provider_or_files():
    with pytest.raises(RuntimeError, match=f"^{LEGACY_PYTHON_RAVENS_ENGINE_ERROR}$"):
        MuninnCrucible("synthetic", object())
