"""Contracts for native Forge and its historical consumer tombstone."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_host_consumer_is_documented_as_a_read_only_post_return_boundary() -> None:
    docs = " ".join(" ".join(read(relative).split()) for relative in (
        "docs/integrations/cstar-kernel-mcp.md",
        "docs/integrations/host_native_skill_contract.md",
    ))
    assert "cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute" in docs
    assert "cstar_forge_swarm_plan -> direct host-native workers" in docs
    assert "cstar_forge_swarm_complete -> DELIVERED_UNVERIFIED" in docs
    assert "forge-native-codex-swarm-v1" in docs
    for term in (
        "consume:forge-host-handoff",
        "host_handoff_queued",
        "host_handoff_replayed",
        "no-follow",
        "ready_for_host_execution",
        "TOCTOU",
        "validation-ticket",
        "actual identity",
    ):
        assert term in docs
    assert "historical, legacy, retired, or generation-tombstoned evidence" in docs
    assert "never current, default, target, recovery, replacement, or fallback routes" in docs
    assert "cannot mutate lifecycle state" in docs


def test_package_and_distribution_surfaces_expose_no_dispatch_hook() -> None:
    package = json.loads(read("package.json"))
    assert package["scripts"]["consume:forge-host-handoff"].endswith(
        "scripts/consume_codex_host_worker_handoff.ts"
    )
    consumer = read("scripts/consume_codex_host_worker_handoff.ts")
    assert "executable_job: null" in consumer
    assert "cstar_record_result" not in consumer
    generator = read("src/packaging/distribution_content.ts")
    assert "consume:forge-host-handoff" in generator
    assert "Historical Codex-host state-only handoffs" in generator
    assert "Current Forge v3 host handoffs require" not in generator


def test_feature_preserves_v3_v2_and_independent_authority_boundaries() -> None:
    feature = read("tests/features/cstar_forge_codex_host_worker_handoff.feature")
    assert "Historical state-only Codex-host Forge handoff tombstone" in feature
    assert "Current native execution never selects the historical bridge" in feature
    assert "Legacy v2 compatibility and v3 replay are generation-tombstoned" in feature
    assert "no CStar lifecycle or validation-ticket mutation" in feature


def test_public_inputs_and_activation_path_match_current_registration() -> None:
    closeout = read(".agents/skills/cstar-closeout/SKILL.md")
    kernel = read("docs/integrations/cstar-kernel-mcp.md")
    registration = read("src/tools/cstar-kernel-mcp/register_core_tools.ts")
    status_handler = read("src/tools/cstar-kernel-mcp/tools/status.ts")
    hall_handler = read("src/tools/cstar-kernel-mcp/tools/hall.ts")

    doctor_start = kernel.index("## 5. `cstar_doctor`")
    doctor_end = kernel.index("\n## 6. `cstar_verify_plan`", doctor_start)
    status_start = kernel.index("## 18. `cstar_status`")
    status_end = kernel.index("\n## 19. `cstar_evolve`", status_start)
    doctor = kernel[doctor_start:doctor_end]
    status = kernel[status_start:status_end]

    assert "**Input:** `{}` (empty object; no input fields)." in doctor
    assert "forge_execution_receipt_id" not in doctor
    assert "**Input:** `{ \"forge_execution_receipt_id\"?: \"forge-execute-<32 lowercase hex>\" }`" in status
    assert "'cstar_doctor',\n        {},\n        handleDoctor" in registration
    assert "'cstar_status',\n        {\n            forge_execution_receipt_id: z.string()" in registration
    assert "export interface StatusArgs {\n    forge_execution_receipt_id?: string;\n}" in status_handler
    assert "export async function handleDoctor()" in hall_handler

    helper = ROOT / ".agents" / "skills" / "cstar-closeout" / "scripts" / "inspect_codex_activation.py"
    assert helper.is_file()
    assert ".agents/skills/cstar-closeout/scripts/inspect_codex_activation.py" in closeout
    assert not (ROOT / "scripts" / "inspect_codex_activation.py").exists()

    kernel_flat = " ".join(kernel.split())
    for phrase in (
        "forge-native-codex-swarm-v1",
        "cstar_forge_swarm_plan",
        "direct host-native workers",
        "one to three useful direct workers",
        "disjoint write ownership",
        "no nested parent, descendants, or peer messages",
        "one attempt",
        "zero retry/replay/ replacement/fallback",
        "separate read-only aggregator",
        "DELIVERED_UNVERIFIED",
        "actual identity",
        "unreported",
        "historical, retired, or generation-tombstoned evidence",
        "install",
        "activation",
        "restart",
        "Git",
        "lifecycle",
    ):
        assert phrase in kernel_flat
