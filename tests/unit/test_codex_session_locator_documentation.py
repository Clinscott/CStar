from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_codex_session_locator_storage_contract_is_documented() -> None:
    documentation = (ROOT / "docs/operations/codex-session-locator-storage-boundary.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_codex_session_locator_storage_boundary.feature").read_text(
        encoding="utf-8"
    )
    for required in ("incrementally", "20,000 entries", "16 nested directories", "512 MiB"):
        assert required in documentation
    assert "no whole directory is materialized in memory" in feature
