"""Documentation contract for the mounted-spoke authority boundary."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_spoke_projection_docs_are_fail_closed_and_value_free() -> None:
    operation = (ROOT / "docs/operations/spoke-projection-authority-boundary.md").read_text(
        encoding="utf-8"
    )
    integration = (ROOT / "docs/integrations/cstar-kernel-mcp.md").read_text(
        encoding="utf-8"
    )
    feature = (ROOT / "tests/features/cstar_spoke_projection_authority.feature").read_text(
        encoding="utf-8"
    )

    for text in (operation, integration):
        compact = " ".join(text.split()).lower()
        assert "spoke_mutation_requires_verified_request_scoped_operator_attestation" in compact
        assert "mount_token" in compact and "unproven" in compact
        assert "raw roots" in compact and "remotes" in compact
        assert "symlink" in compact and "hardlink" in compact
        assert "dry_run=true" in compact
    assert "does not inspect the supplied root" in feature
    assert "only safe relative paths may be persisted" in feature
