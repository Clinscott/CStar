from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_retired_orphan_packaging_contract_is_documented() -> None:
    documentation = (ROOT / "docs/operations/retired-orphan-packaging-scripts.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_retired_orphan_packaging_scripts.feature").read_text(
        encoding="utf-8"
    )
    for failure in (
        "legacy_usb_sentry_dogfood_script_retired_use_cstar_spoke_bead_import",
        "legacy_python_skill_packager_retired_use_supported_skill_packaging_surface",
        "legacy_node_skill_packager_retired_use_supported_skill_packaging_surface",
        "legacy_claude_plugin_version_sync_retired_use_distribution_builder",
        "legacy_cascading_context_loader_retired_use_host_instruction_surface",
    ):
        assert failure in documentation
    assert "no child, source, state, Hall, SQLite, Git, install, provider, or network effect starts" in feature
