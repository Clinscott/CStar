"""Documentation contract for runtime effect classification and containment."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_runtime_execution_boundary_is_current_and_fail_closed() -> None:
    operations = (ROOT / "docs/operations/cstar-kernel-secret-environment-boundary.md").read_text(
        encoding="utf-8"
    )
    integration = (ROOT / "docs/integrations/cstar-kernel-mcp.md").read_text(encoding="utf-8")
    feature = (ROOT / "tests/features/cstar_runtime_execution_classification.feature").read_text(
        encoding="utf-8"
    )

    for text in (operations, integration):
        assert "classified `EXECUTION`" in text
        assert "canonical" in text and "repository" in text and "venv" in text
    assert "disabled by default" in operations
    assert "Raw messages, stacks, paths, and environment" in operations
    assert "only an allowlisted error code and truncated fingerprint" in feature
