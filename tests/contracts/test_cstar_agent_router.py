from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AGENTS = ROOT / "AGENTS.md"
POINTER = ROOT / "AGENTS.qmd"
ROUTER = ROOT / ".agents" / "AGENTS.feature"
RESEARCHER = ROOT / ".agents" / "skills" / "researcher" / "SKILL.md"


def test_agents_md_is_a_small_router_not_a_parallel_runbook() -> None:
    text = AGENTS.read_text(encoding="utf-8")
    assert len(text.splitlines()) <= 60
    assert ".agents/AGENTS.feature" in text
    assert "deterministic runner effect" in text
    assert "native task-control work cell" in text
    assert "TOMBSTONED_PERMANENT" in text
    assert "direct Hall/SQLite" in text
    assert "Detailed procedures belong in" in text


def test_gherkin_router_targets_only_existing_canonical_contracts() -> None:
    text = ROUTER.read_text(encoding="utf-8")
    assert "Feature: CStar operator workflow router" in text
    for path in (AGENTS, POINTER, ROUTER):
        inherited_text = path.read_text(encoding="utf-8")
        assert not re.search(
            r"One Mind|Weave Protocol|dispatchPort\.dispatch",
            inherited_text,
            re.IGNORECASE,
        ), path
    contracts = re.findall(
        r"\|\s*(?:docs|\.agents)/[^|]+\.(?:md|feature)\s*\|",
        text,
    )
    assert contracts
    for cell in contracts:
        relative = cell.strip("| ")
        assert (ROOT / relative).is_file(), relative


def test_router_keeps_native_work_cells_and_independent_validation_explicit() -> None:
    text = ROUTER.read_text(encoding="utf-8")
    implementation = next(line for line in text.splitlines() if "implementation is requested" in line)
    assert "cstar_mission" in implementation
    assert "deterministic runner effect" in implementation
    assert "native task-control work cell" in implementation
    validation = next(line for line in text.splitlines() if "delivery needs validation" in line)
    assert "independent cstar_record_result" in validation
    assert "docs/integrations/codex_mcp_contract.md" in implementation
    assert "docs/integrations/codex_mcp_contract.md" in validation


def test_router_covers_current_operator_situations() -> None:
    text = ROUTER.read_text(encoding="utf-8")
    for situation in (
        "kernel health is unknown",
        "a known mission resumes",
        "route or scope is ambiguous",
        "implementation is requested",
        "external evidence is requested",
        "delivery needs validation",
        "mapped project context is due",
        "daily freshness is due",
        "persona posture changes",
        "CoS context rotates",
    ):
        assert situation in text
    assert "cstar-closeout and one bounded generated handoff" in text
    assert "A required operator grant is absent" in text


def test_persona_route_is_explicit_iterative_and_non_authoritative() -> None:
    router = ROUTER.read_text(encoding="utf-8")
    workflow = (ROOT / "docs" / "operations" / "cstar-iterative-development.md").read_text(
        encoding="utf-8",
    )
    assert "cstar_persona_set" in router
    assert "cstar_persona_set" in workflow
    assert "iterative build-run-test-repair" in workflow
    assert "Persona is explicit workflow state, not model inference and not authority" in workflow
    assert "do not infer authority from persona" in router


def test_compatibility_pointer_cannot_reintroduce_forge_authority() -> None:
    text = POINTER.read_text(encoding="utf-8")
    assert "compatibility pointer only" in text
    assert "Forge is `TOMBSTONED_PERMANENT`" in text
    assert "deterministic effects" in text
    assert "cstar_persona_set" in text


def test_researcher_contract_keeps_pmts_information_only() -> None:
    text = RESEARCHER.read_text(encoding="utf-8")
    assert "source_callback_thread_id" in text
    assert "state_update_thread_id" in text
    assert "deprecated compatibility alias" in text
    assert "PMT unavailability is a freshness gap, not" in text
    assert "MM is inactive and has no active routing, synthesis, ownership, relay, review, or execution role" in " ".join(text.split())
    assert "A PMT is never that" in text
    for forbidden in (
        "PMT-owned",
        "owner PMT",
        "PMT lane",
    ):
        assert forbidden not in text
