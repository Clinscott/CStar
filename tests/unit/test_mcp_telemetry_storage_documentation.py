from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_mcp_telemetry_storage_is_bounded_and_non_authoritative() -> None:
    documentation = (ROOT / "docs/operations/mcp-telemetry-storage-boundary.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_mcp_telemetry_storage_boundary.feature").read_text(
        encoding="utf-8"
    )
    for required in (
        "best-effort evidence, not lifecycle authority",
        "2 MiB",
        "8 KiB",
        "mode 0600",
        "Symlinked roots",
        "private non-recordable disposition",
        "forge_operator_authorization_required",
        "forge_execution_authorization_required",
        "never infers authority from error-message prefixes",
    ):
        assert required in documentation
    assert "the tool lifecycle result is unchanged" in feature
    assert "no usage or usefulness JSONL is written" in feature
    assert "receipt-state distinctions are not exposed" in feature
    assert "bounded failure event remains recordable" in feature
