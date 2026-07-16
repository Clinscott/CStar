from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_residual_python_effect_docs_match_feature_contract() -> None:
    documentation = (
        ROOT / "docs/operations/retired-python-residual-effect-surfaces.md"
    ).read_text(encoding="utf-8")
    feature = (
        ROOT / "tests/features/cstar_retired_python_residual_effect_surfaces.feature"
    ).read_text(encoding="utf-8")

    for error in (
        "legacy_python_validation_persistence_retired_use_cstar_record_result",
        "legacy_python_stability_watcher_retired_use_cstar_kernel",
        "legacy_python_sandbox_warden_retired_use_supported_sandbox",
        "legacy_python_memory_authority_retired_use_cstar_kernel",
    ):
        assert error in documentation

    assert "legacy_python_validation_persistence_retired_use_cstar_record_result" in feature
    assert "legacy_python_memory_authority_retired_use_cstar_kernel" in feature
    assert "cstar_record_result" in documentation
    assert "process-local detached lexical index" in documentation
    assert "Pure calculation remains available" in feature
