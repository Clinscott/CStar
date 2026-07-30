from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_legacy_context_docs_match_feature_contract() -> None:
    documentation = (
        ROOT / "docs/operations/retired-python-legacy-context-effects.md"
    ).read_text(encoding="utf-8")
    feature = (
        ROOT / "tests/features/cstar_retired_python_legacy_context_effects.feature"
    ).read_text(encoding="utf-8")

    for error in (
        "legacy_python_context_effect_surface_retired_use_cstar_kernel",
        "legacy_python_cortex_runtime_retired_use_bounded_cstar_hall_search",
        "legacy_python_skill_forge_effect_retired_use_cstar_forge",
        "legacy_python_skill_directory_scan_retired_use_cstar_skill_registry",
        "legacy_python_vector_scan_caller_retired_use_cstar_validation",
        "legacy_python_weight_tuner_effect_retired_use_cstar_validation",
    ):
        assert error in documentation
        assert error in feature

    assert (
        "cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute"
        in documentation
    )
    assert "bounded CStar Hall search" in documentation
    assert "explicit intent text" in feature
    assert "Historical scan callers are tombstones" in feature
