from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_setup_packaging_install_contract_preserves_operator_gates() -> None:
    documentation = (ROOT / "docs/operations/setup-packaging-install-authority.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_setup_packaging_install_authority.feature").read_text(
        encoding="utf-8"
    )
    integration = (ROOT / "docs/integrations/codex_mcp_contract.md").read_text(
        encoding="utf-8"
    )
    errors = (
        "direct_codex_plugin_install_retired_use_supported_codex_plugin_surface",
        "direct_gemini_extension_install_retired_requires_supported_host_surface",
        "direct_local_setup_retired_requires_operator_gated_supported_installer",
        "legacy_codex_cli_activity_sidecar_retired_use_host_runtime_receipt",
        "legacy_codex_self_heal_retired_requires_operator_gated_supported_plugin_surface",
        "legacy_codex_launcher_smoke_retired_use_cstar_doctor_and_live_runtime_proof",
    )
    for error in errors:
        assert error in documentation
        assert error in integration
    assert "installation activation restart deployment and production claims remain separately gated" in feature
