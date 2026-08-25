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
    assert len(text.splitlines()) <= 50
    assert ".agents/AGENTS.feature" in text
    assert "cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> independent cstar_record_result" in text
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


def test_router_keeps_set_materialization_and_automatic_advancement_explicit() -> None:
    text = ROUTER.read_text(encoding="utf-8")
    set_design = next(line for line in text.splitlines() if "a new SET/design is ready" in line)
    forge = next(line for line in text.splitlines() if "implementation is requested" in line)
    assert "one cstar_augury mission_boundary v2 with v1 compatibility" in set_design
    assert "cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute" in forge
    validation = next(line for line in text.splitlines() if "delivery needs validation" in line)
    assert "independent cstar_record_result" in validation
    assert "automatic next-child advancement" in validation
    assert "docs/operations/corvus-forge-pipeline-playbook.md" in forge
    assert "docs/operations/corvus-forge-pipeline-playbook.md" in validation


def test_router_covers_current_operator_situations() -> None:
    text = ROUTER.read_text(encoding="utf-8")
    for situation in (
        "kernel health is unknown",
        "a known mission resumes",
        "route or scope is ambiguous",
        "a new SET/design is ready",
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


def test_router_keeps_cstar_state_and_cos_orchestration_separate() -> None:
    agents = AGENTS.read_text(encoding="utf-8")
    router = ROUTER.read_text(encoding="utf-8")

    assert "CStar is only the deterministic state manager" in agents
    assert "CoS in Codex is the supervisor/delegator" in agents
    assert "CoS owns no host goal" in agents
    assert "must never create, resume, update, pause, block, complete, or close one" in agents
    assert "replacement workers get a new goal plus bounded handoff" in agents
    assert "CStar does not launch agents, workthreads, providers, or cognition" in router
    assert "CoS does not implement, research, debug, edit source" in router
    assert "Host goals belong to workers, not CoS" in router
    assert "gpt-5.6-luna" in agents
    assert "reasoning effort \"max\"" in router
    assert "never silently falls back" in router
    assert "retained/resumable host-issued worker thread with stable lineage" in router
    assert "gpt-5.6-sol" in router
    assert "gpt-5.6-terra" in router
    assert "6-normal" not in router
    assert "8-burst" not in router


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


def test_compatibility_pointer_cannot_reintroduce_a_short_forge_route() -> None:
    text = POINTER.read_text(encoding="utf-8")
    assert "compatibility pointer only" in text
    assert ".agents/AGENTS.feature" in text
    assert "cstar_persona_set" in text


def test_researcher_contract_keeps_pmts_information_only() -> None:
    text = RESEARCHER.read_text(encoding="utf-8")
    assert "source_callback_thread_id" in text
    assert "state_update_thread_id" in text
    assert "deprecated compatibility alias" in text
    assert "PMT unavailability is a freshness gap, not" in text
    assert "MM is legacy and has no active routing role" in text
    assert "A PMT is never that" in text
    for forbidden in (
        "PMT-owned",
        "owner PMT",
        "PMT lane",
    ):
        assert forbidden not in text
