"""Documentation contracts for retired CStar compatibility surfaces."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_historical_root_docs_are_explicitly_non_authoritative() -> None:
    for relative in (
        "docs/handshake.md",
        "docs/handshake_session_113.md",
        "docs/walkthrough.qmd",
        "docs/dev_journal.qmd",
        "docs/API_LEDGER.qmd",
    ):
        preamble = "\n".join(_read(relative).splitlines()[:20]).lower()
        assert "historical" in preamble, relative
        assert "authority" in preamble or "authoritative" in preamble, relative


def test_current_operator_pointers_do_not_advertise_retired_routes() -> None:
    current = (
        "docs/base-operating-kernel.md",
        "docs/augury-operator-handoff.md",
        ".agents/extension/GEMINI.md",
        ".agents/extension/skills/restoration/SKILL.md",
        "docs/integrations/hall_multi_agent_coordination_api.md",
    )
    retired_commands = (
        "./cstar hall",
        "cstar hall ",
        "cstar orchestrate",
        "cstar ravens",
        "cstar one-mind",
        'delegate_to_subagent("autobot")',
    )
    for relative in current:
        text = _read(relative)
        for command in retired_commands:
            assert command not in text, (relative, command)

    gemini = _read(".agents/extension/GEMINI.md")
    restoration = _read(".agents/extension/skills/restoration/SKILL.md")
    coordination = _read("docs/integrations/hall_multi_agent_coordination_api.md")
    assert "direct `cstar-kernel` MCP" in gemini
    assert "Persona is style-only" in gemini
    assert "not registered" in restoration
    assert "grant no current authority" in coordination

    for relative in (
        "docs/architecture/HALL_PER_SPOKE_TRAY.md",
        "docs/architecture/HOST_CONVERGENCE_BACKLOG.qmd",
        "docs/plans/autobot-build-summary.md",
        "docs/superpowers/plans/2026-06-28-cstar-kernel-mcp-separation-of-concerns.md",
    ):
        preamble = "\n".join(_read(relative).splitlines()[:20]).lower()
        assert "historical" in preamble, relative
        assert "authority" in preamble or "instructions" in preamble, relative


def test_retired_legacy_execution_lore_requires_no_effects() -> None:
    feature = _read("tests/features/cstar_retired_legacy_execution_surfaces.feature")
    for required in (
        "only supported CStar MCP transport",
        "receives none of the synthetic secrets",
        "performs no provider, shell, filesystem, Hall, or lifecycle effect",
        "reads no credential file and starts no Hermes process",
        "reads no secret or live source",
        "writes no Hall or project state",
        "starts no timer process listener provider or callback",
        "writes no Hall StateRegistry token or project state",
        "reads no host memory or plan source",
        "writes no Hall lifecycle schema gravity or episodic state",
        "pure Augury formatting may continue without appending a ledger",
        "Synapse repair fails before filesystem SQLite backup or schema effects",
    ):
        assert required in feature
