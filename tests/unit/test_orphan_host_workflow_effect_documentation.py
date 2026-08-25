from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_orphan_host_workflow_effect_contract_is_complete() -> None:
    documentation = (ROOT / "docs/operations/retired-orphan-host-workflow-effects.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_retired_orphan_host_workflow_effects.feature").read_text(
        encoding="utf-8"
    )
    errors = (
        "legacy_chant_planner_retired_use_host_native_skill",
        "legacy_chant_planner_artifacts_retired_use_cstar_kernel",
        "legacy_architect_service_retired_use_host_native_skill",
        "legacy_host_governor_candidates_retired_use_cstar_handoff",
        "legacy_pennyone_crawler_retired_use_cstar_hall_search",
        "legacy_pennyone_intent_refresh_retired_use_cstar_kernel",
        "legacy_economy_effect_surface_retired_requires_operator_gate",
    )
    for error in errors:
        assert error in documentation
    assert "directly importable bypass" in feature
    assert "no provider callback source filesystem Hall or dispatch effect" in feature
