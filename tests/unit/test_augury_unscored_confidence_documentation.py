from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_active_augury_docs_do_not_authorize_unscored_numeric_confidence() -> None:
    handoff = (ROOT / "docs/augury-operator-handoff.md").read_text(encoding="utf-8")
    naming = (ROOT / "docs/trace-naming-contract.md").read_text(encoding="utf-8")
    council = (ROOT / "docs/architecture/COUNCIL_EXECUTION_SYSTEM.md").read_text(
        encoding="utf-8"
    )
    kernel = (ROOT / "docs/integrations/cstar-kernel-mcp.md").read_text(
        encoding="utf-8"
    )

    assert "Current Augury omits numeric confidence" in handoff
    assert "current emitters omit it" in naming
    assert "LIVE CONFIDENCE SCORING NOT IMPLEMENTED" in council
    assert "present Council/Augury path emits no numeric" in council
    assert "No numeric confidence is emitted unless an independent" in kernel


def test_trace_naming_example_does_not_emit_confidence_line() -> None:
    naming = (ROOT / "docs/trace-naming-contract.md").read_text(encoding="utf-8")
    example = naming.split("```text", 1)[1].split("```", 1)[0]

    assert "Confidence:" not in example
