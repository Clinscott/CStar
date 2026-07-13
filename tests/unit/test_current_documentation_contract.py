"""Focused contracts for current CStar documentation topology."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CURRENT_SKILLS = {"corvus-forge", "researcher", "cstar-closeout"}


def _read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


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
