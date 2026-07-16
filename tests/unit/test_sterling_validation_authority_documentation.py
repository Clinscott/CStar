"""Documentation contract for the Sterling validation authority boundary."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_sterling_docs_reject_claimed_or_cached_authority() -> None:
    operation = (ROOT / "docs/operations/sterling-validation-authority-boundary.md").read_text(
        encoding="utf-8"
    )
    integration = (ROOT / "docs/integrations/cstar-kernel-mcp.md").read_text(encoding="utf-8")
    feature = (ROOT / "tests/features/cstar_sterling_validation_authority.feature").read_text(
        encoding="utf-8"
    )

    for text in (operation, integration):
        assert "authority_class=verified_v2" in text
        assert "independent" in text
        assert "cstar.validation-evidence.v2" in text and "SHA-256" in text
        assert "requester" in text and "executor" in text
        assert "cached" in text
        assert "force" in text and "exemption" in text
    assert "rejects the path without reading outside" in feature
    assert "original verified receipt remains immutable" in feature
