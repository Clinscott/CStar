from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_retired_python_autonomous_surface_docs_match_feature_contract():
    documentation = (
        ROOT / "docs/architecture/retired-python-autonomous-surfaces.md"
    ).read_text(encoding="utf-8")
    feature = (
        ROOT / "tests/features/cstar_retired_python_autonomous_surfaces.feature"
    ).read_text(encoding="utf-8")

    for error in (
        "legacy_python_sovereign_component_retired_use_cstar_kernel",
        "legacy_python_ravens_engine_retired_use_cstar_kernel",
        "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel",
    ):
        assert error in documentation
        assert error in feature

    assert (
        "cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute"
        in documentation
    )
    assert "cstar_record_result" in documentation
    assert "Vector engine's former neural reranker" in documentation
    assert "Mocking a retired engine into success" in documentation
    assert "vitals manifest debug harness benchmark or neural reranking" in feature
    assert "grants no execution validation or promotion authority" in feature
