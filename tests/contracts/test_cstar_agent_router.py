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
    assert "request -> authorize -> execute -> independent record_result" in text
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


def test_router_keeps_forge_authorization_and_independent_validation_explicit() -> None:
    text = ROUTER.read_text(encoding="utf-8")
    forge = next(line for line in text.splitlines() if "implementation is requested" in line)
    assert "cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute" in forge
    validation = next(line for line in text.splitlines() if "delivery needs validation" in line)
    assert "independent cstar_record_result" in validation
    assert "docs/operations/corvus-forge-pipeline-playbook.md" in forge
    assert "docs/operations/corvus-forge-pipeline-playbook.md" in validation


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


def test_durability_requires_verified_remote_storage_without_extra_authority() -> None:
    agents = AGENTS.read_text(encoding="utf-8")
    router = ROUTER.read_text(encoding="utf-8")
    workflow = (ROOT / "docs" / "operations" / "cstar-iterative-development.md").read_text(
        encoding="utf-8",
    )
    assert "authorized remote" in agents
    assert "local commits, and stashes as non-durable" in router
    assert "A local commit is not a durability checkpoint" in workflow
    assert "one full clone" in workflow
    assert "grants no merge, deployment, execution" in " ".join(workflow.split())


def test_compatibility_pointer_cannot_reintroduce_a_short_forge_route() -> None:
    text = POINTER.read_text(encoding="utf-8")
    assert "compatibility pointer only" in text
    assert re.search(r"request,\s*authorize, execute, and independent[- ]validation", text)
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
