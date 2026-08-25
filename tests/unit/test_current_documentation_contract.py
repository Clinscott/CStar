"""Focused contracts for current CStar documentation topology."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CURRENT_SKILLS = {"corvus-forge", "researcher", "cstar-closeout"}


def _read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def _flat(text: str) -> str:
    return " ".join(text.split())


def test_repository_instructions_keep_legacy_cstar_out_of_workflow_routing() -> None:
    agents = _read("AGENTS.md")
    pointer = _read("AGENTS.qmd")
    router = _read(".agents/AGENTS.feature")

    assert "not the active Corvus control plane" in _flat(agents)
    assert "parent Corvus Organism projection governs" in _flat(agents)
    assert "must not route work back into CStar" in _flat(agents)
    assert "CStar is archived source and evidence" in _flat(pointer)
    assert "CStar routes are not selected" in _flat(router)
    assert "Corvus Organism remains the workflow authority" in _flat(router)


def test_current_registry_and_docs_expose_only_three_agent_native_skills() -> None:
    registry = json.loads(_read(".agents/skill_registry.json"))
    entries = registry["entries"]

    assert set(entries) == CURRENT_SKILLS
    for entry in entries.values():
        assert entry["tier"] == "SKILL"
        assert entry["entry_surface"] == "host-only"
        assert entry["execution"]["mode"] == "agent-native"
        assert entry["owner_runtime"] == "host-agent"

    for relative in (
        "docs/architecture/SKILL_REGISTRY.md",
        "docs/architecture/SKILL_PERMUTATIONS.md",
        "docs/integrations/host_native_skill_contract.md",
        "docs/integrations/cstar_capability_discovery_api.md",
    ):
        text = _read(relative)
        for skill in CURRENT_SKILLS:
            assert f"`{skill}`" in text, (relative, skill)


def test_current_architecture_docs_reject_legacy_execution_topology() -> None:
    registry_doc = _read("docs/architecture/SKILL_REGISTRY.md")
    weave_doc = _read("docs/architecture/WEAVES.md")
    host_doc = _read("docs/integrations/host_native_skill_contract.md")

    assert "single source of truth for all capabilities" not in registry_doc
    assert "The Weaves (" not in registry_doc
    assert "no active weave" in weave_doc
    assert "There is no reverse model bridge" not in host_doc  # wording lives in compatibility pointer
    assert "does not create a callback from CStar into the host" in host_doc
    assert "MimirClient.request" not in host_doc
    assert "PMTs may be queried only as mapped project information repositories" in host_doc
    assert "MM is legacy" in host_doc


def test_codex_active_turn_identity_is_a_root_user_projection() -> None:
    kernel_doc = _read("docs/integrations/cstar-kernel-mcp.md")

    assert "one ordered root-user projection" in kernel_doc
    assert "they never join, close, timestamp, or" in kernel_doc
    assert "invalidate a root-user cohort" in kernel_doc
    assert "tagged row that explicitly" in kernel_doc
    assert "without the canonical" in kernel_doc
    assert "selected-turn id on any non-root-user record fails closed" not in kernel_doc


def test_codex_identity_streams_a_bounded_long_lived_session_projection() -> None:
    kernel_doc = _read("docs/integrations/cstar-kernel-mcp.md")

    assert "bounded stream" in kernel_doc
    assert "hashes the complete file" in kernel_doc
    assert "strictly validates every UTF-8 JSONL row" in kernel_doc
    assert "retains no raw authority-row list" in kernel_doc
    assert "physical file remains capped at 512 MiB" in kernel_doc
    assert "full scan at 1,000,000 rows" in kernel_doc
    assert "selected-turn limits of 256 records and 4 MiB" in kernel_doc
    assert "derived from the same descriptor scan" in kernel_doc
    assert "no second session" in kernel_doc


def test_forge_docs_match_the_empty_hermes_toolset_contract() -> None:
    kernel_doc = _read("docs/integrations/cstar-kernel-mcp.md")
    playbook = _read("docs/operations/corvus-forge-pipeline-playbook.md")
    skill_spec = _read("docs/operations/corvus-forge-skill-spec.md")
    delegate = _read(
        ".agents/skills/corvus-forge/scripts/hermes_minimax_delegate.mjs"
    )

    assert "Hermes exposes no tools under exact Forge mode" in kernel_doc
    assert "Hermes exposes only `clarify`" not in kernel_doc
    for text in (kernel_doc, playbook, skill_spec):
        assert "`context_engine`" in text
    assert "const NO_TOOLS_TOOLSET = 'context_engine';" in delegate


def test_forge_docs_require_process_containment_and_runtime_lineage() -> None:
    kernel_doc = _read("docs/integrations/cstar-kernel-mcp.md")
    playbook = _read("docs/operations/corvus-forge-pipeline-playbook.md")
    skill_spec = _read("docs/operations/corvus-forge-skill-spec.md")

    for text in (kernel_doc, playbook, skill_spec):
        assert "Bubblewrap" in text
        assert "PID 1" in text
        assert "-I -S -B" in text
        assert "no site-packages" in text
        assert "sys.pycache_prefix" in text
    assert "console stub is a locator, not lineage proof" in playbook
    assert "same in-memory bytes" in playbook
    assert "requires the CStar-bound proof" in skill_spec


def test_forge_docs_require_hermes_owned_oauth_without_credential_env() -> None:
    docs = tuple(
        _read(relative)
        for relative in (
            "docs/integrations/cstar-kernel-mcp.md",
            "docs/operations/corvus-forge-pipeline-playbook.md",
            "docs/operations/corvus-forge-skill-spec.md",
        )
    )

    for text in docs:
        assert "minimax-oauth" in text
        assert "cstar-hub" in text
        assert "2100 seconds" in text
        assert "before reservation" in text or "before an attempt is reserved" in text
        assert "forge-minimax.env" not in text
        assert "MINIMAX_API_KEY" not in text
        assert "descriptor 3" not in text
        assert "never" in text and "opens" in text and "`auth.json`" in text
        assert "idempotency-key" in text and "replay" in text
        assert "forge_minimax_oauth.py" in text


def test_forge_docs_match_bounded_six_role_runtime_contract() -> None:
    docs = tuple(
        _flat(_read(relative))
        for relative in (
            "docs/integrations/cstar-kernel-mcp.md",
            "docs/operations/corvus-forge-pipeline-playbook.md",
            "docs/operations/corvus-forge-skill-spec.md",
        )
    )
    role_plan = _read(
        ".agents/skills/corvus-forge/scripts/forge_role_plan.mjs"
    )

    for text in docs:
        assert "bounded-six-role-manifest-v1" in text
        assert "specifier -> coder -> cleaner -> architect -> hardener -> QA" in text
        assert "fresh sealed Hermes process" in text
        assert "exactly one fixed-host" in text
        assert "non-retrying MiniMax request" in text
        assert "forge_role_plan.mjs" in text
        assert "HERMES_BIN" in text
        assert "prepared, started, and terminal success/failure" in text
        assert "runtime-content digest" in text
        assert "terminal" in text and "trace" in text and "SHA-256" in text
        assert "not the genuine upstream SwarmForge six-pack" in text
        assert "tmux" in text and "Git-worktree" in text

    for text in docs:
        assert "specification_handoff_sha256" in text
        assert "immutable" in text and "specification" in text
        assert "hardender" in text and "hardener" in text
        assert "role-plan digest" in text and "runtime-content digest" in text
        assert "terminal trace" in text and (
            "mandatory" in text or "required" in text
        )
    assert "QA alone yields the final manifest" in docs[0]
    assert "QA alone" in docs[1] and "final exact-output manifest" in docs[1]
    assert "QA verifies" in docs[2] and "final exact-output manifest" in docs[2]
    assert "Zero retries means" in docs[0]
    assert "Zero retries means" in docs[1]
    assert "Zero retries means" in docs[2]
    assert "FORGE_ROLE_PLAN_ID = 'bounded-six-role-manifest-v1'" in role_plan
    for role in ("specifier", "coder", "cleaner", "architect", "hardener", "qa"):
        assert f"'{role}'" in role_plan


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
