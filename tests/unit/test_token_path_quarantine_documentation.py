"""Documentation contracts for the quarantined TokenPath boundary."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_augury_docs_describe_static_quarantine_instead_of_live_advice() -> None:
    document = _read("docs/integrations/cstar-kernel-mcp.md")
    augury = document.split("## 4. `cstar_augury`", 1)[1].split(
        "## 5. `cstar_doctor`", 1
    )[0]

    for required in (
        "static status envelope",
        "does not read `AUGURY_TOKEN_PATH_ROOT`",
        "dynamically import an advisor",
        "A hostile environment override is inert",
        "return `null`",
        "temporary fallback",
        '"status": "quarantined"',
        '"actionable": false',
        '"advisor_available": false',
        '"external_root_consulted": false',
    ):
        assert required in augury

    for stale in (
        '"advisor": "augury-token-path"',
        '"mode": "shadow-disabled"',
        '"episode_id"',
        '"selected_policy"',
    ):
        assert stale not in augury


def test_token_path_lore_requires_no_external_probe_write_or_receipt() -> None:
    feature = _read("tests/features/cstar_mcp_token_path_feedback.feature")
    document = _read("docs/integrations/cstar-kernel-mcp.md")

    for required in (
        "hostile synthetic external root",
        "does not probe or import the external TokenPath root",
        "attaches no policy, episode, confidence, budget, or live advice",
        "writes no project or temporary fallback file",
        "historical project-local telemetry remains read-only",
    ):
        assert required in feature

    assert "auto-links the recent advice" not in feature
    assert "observation is written" not in feature
    assert "reads only bounded regular historical JSONL under the CStar" in document
    assert "symlink, hardlink, oversized, malformed, or missing inputs fail" in document
    assert "turns compatibility telemetry into a current recommendation" in document
