from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENTS = ROOT / "AGENTS.md"
POINTER = ROOT / "AGENTS.qmd"
ROUTER = ROOT / ".agents" / "AGENTS.feature"


def test_agents_md_is_a_small_archive_boundary() -> None:
    text = AGENTS.read_text(encoding="utf-8")
    assert len(text.splitlines()) <= 50
    assert "Legacy CStar Archive Boundary" in text
    assert "parent Corvus Organism projection governs" in text
    assert "Do not launch or install `cstar-kernel`" in text
    assert "must not route work back into CStar" in text
    assert "Never read or print `.agents/config.json`" in text


def test_compatibility_pointer_cannot_reintroduce_authority() -> None:
    text = POINTER.read_text(encoding="utf-8")
    assert "Legacy CStar Compatibility Notice" in text
    assert "archived source and evidence" in text
    assert "Do not use `.agents/AGENTS.feature` for situation routing" in text
    assert "never restores CStar authority" in text
    for active_route in (
        "cstar_forge_request",
        "cstar_persona_set",
        "cstar_handoff",
        "cstar_goal_resume",
    ):
        assert active_route not in text


def test_gherkin_surface_routes_only_to_inactivity() -> None:
    text = ROUTER.read_text(encoding="utf-8")
    assert "Feature: Legacy CStar route remains inactive" in text
    assert "CStar routes are not selected" in text
    assert "no CStar runtime or host integration is launched" in text
    assert "Corvus Organism remains the workflow authority" in text
    assert "|" not in text
    for active_route in (
        "cstar_forge_request",
        "cstar_researcher_request",
        "cstar_record_result",
        "cstar_persona_set",
    ):
        assert active_route not in text
