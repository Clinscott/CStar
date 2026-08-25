from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / ".agents" / "skill_registry.json"
SKILL = ROOT / ".agents" / "skills" / "cstar-reliability-loop" / "SKILL.md"
SCHEMA = SKILL.parent / "references" / "reliability-continuation.schema.json"
FEATURE = ROOT / "tests" / "features" / "cstar_reliability_loop.feature"


def test_registry_exposes_host_only_reliability_loop_contract() -> None:
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entry = registry["entries"]["cstar-reliability-loop"]
    assert entry["entry_surface"] == "host-only"
    assert entry["owner_runtime"] == "host-agent"
    assert entry["execution"] == {
        "mode": "agent-native",
        "ownership_model": "host-workflow",
    }
    assert entry["instruction_path"] == ".agents/skills/cstar-reliability-loop/SKILL.md"
    assert ".agents/skills/cstar-reliability-loop/references/reliability-continuation.schema.json" in entry["contracts"]
    assert "tests/features/cstar_reliability_loop.feature" in entry["contracts"]
    assert "tests/unit/cstar-kernel-mcp/test_reliability_loop.test.ts" in entry["tests"]
    assert "tests/unit/cstar-kernel-mcp/test_reliability_loop_result.test.ts" in entry["tests"]


def test_skill_preserves_orchestration_and_authority_boundaries() -> None:
    text = SKILL.read_text(encoding="utf-8")
    text = " ".join(text.split())
    for phrase in (
        "CStar is the state manager",
        "canonical receipt authority",
        "CoS is the",
        "authorized Forge implementation and repair lane",
        "distinct independent validator owns acceptance",
        "actual identity is `unreported` unless the host explicitly attests otherwise",
        "never spawns a",
        "Routine work does not run SPRT",
        "Critical positive results require a hash-bound",
        "cstar.workflow_sprt_autoresearcher.v1",
        "Gungnir section is heuristic evidence only",
        "repository_binding.repo_id",
        "materialize the exact draft with `cstar_bead`",
        "Protected and external decisions remain operator gates",
        "No hidden write, provider dispatch",
        "operator_decision_required",
    ):
        assert phrase in text


def test_schema_describes_the_returned_draft_without_inventing_bead_arguments() -> None:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    assert schema["additionalProperties"] is False
    draft = schema["$defs"]["repair_draft"]
    assert draft["additionalProperties"] is False
    assert "repository_binding" in draft["required"]
    assert "repo_id" not in draft["properties"]
    binding = draft["properties"]["repository_binding"]
    assert binding["additionalProperties"] is False
    assert binding["required"] == ["repo_id"]
    assert schema["properties"]["authority_effect"] == {"const": "process_only"}
    assert schema["properties"]["state"]["enum"] == [
        "working",
        "repairing",
        "accepted",
        "operator_decision_required",
    ]


def test_feature_covers_the_full_bounded_contract() -> None:
    text = FEATURE.read_text(encoding="utf-8")
    assert text.count("Scenario:") >= 11
    for phrase in (
        "compatibility opt-in",
        "routine validation",
        "elevated validation",
        "critical validation",
        "valid, manifest-bound",
        "malformed, wrong-hash, path-traversing, aliased, duplicate, or unbound",
        "Gungnir remains heuristic",
        "INCONCLUSIVE SPRT",
        "deterministic idempotent repair bead draft",
        "operator_decision_required",
        "no hidden write or dispatch",
        "does not create, claim, dispatch, retry, or spend",
    ):
        assert phrase in text


def test_production_and_focused_sources_remain_within_the_nearest_limit() -> None:
    paths = (
        ROOT / "src" / "tools" / "cstar-kernel-mcp" / "contracts" / "record_result_input.ts",
        ROOT / "src" / "tools" / "cstar-kernel-mcp" / "tools" / "reliability_loop.ts",
        ROOT / "src" / "tools" / "cstar-kernel-mcp" / "tools" / "result.ts",
        ROOT / "src" / "tools" / "cstar-kernel-mcp" / "register_core_tools.ts",
        ROOT / "tests" / "unit" / "cstar-kernel-mcp" / "test_reliability_loop.test.ts",
        ROOT / "tests" / "unit" / "cstar-kernel-mcp" / "test_reliability_loop_result.test.ts",
        Path(__file__),
    )
    for path in paths:
        assert path.read_text(encoding="utf-8").count("\n") <= 500, path
