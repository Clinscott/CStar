from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_capability_registry_read_contract_is_bounded() -> None:
    documentation = (ROOT / "docs/operations/capability-registry-read-boundary.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_capability_registry_read_boundary.feature").read_text(
        encoding="utf-8"
    )
    for required in (
        ".agents/skill_registry.json",
        "There is no `CSTAR_CONTROL_ROOT` fallback",
        "files over 1 MiB",
        "512 KiB",
        "fail closed",
    ):
        assert required in documentation
    assert "no ambient control root Hall secret provider process network or write effect" in feature


def test_retired_pennyone_projection_effect_contract_is_complete() -> None:
    documentation = (ROOT / "docs/operations/retired-pennyone-projection-effects.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_retired_pennyone_projection_effects.feature").read_text(
        encoding="utf-8"
    )
    for error in (
        "legacy_matrix_artifact_write_retired_use_cstar_kernel",
        "legacy_gravity_store_retired_use_cstar_kernel",
        "legacy_pennyone_direct_search_retired_use_cstar_hall_search",
        "legacy_pennyone_report_writer_retired_use_cstar_kernel",
        "legacy_node_pennyone_warden_retired_use_cstar_warden",
        "legacy_hall_document_restore_retired_requires_operator_gate",
        "legacy_chronicle_indexer_retired_use_cstar_hall_surfaces",
        "legacy_semantic_indexer_retired_use_cstar_hall_surfaces",
        "legacy_hall_migration_retired_requires_cstar_lifecycle",
        "legacy_sovereign_state_reader_retired_use_cstar_hall_surfaces",
    ):
        assert error in documentation
    assert "no filesystem stdout provider Git Hall secret or callback effect" in feature
