"""Contracts for the historical Codex-host consumer and current native route."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_host_consumer_is_documented_as_a_read_only_post_return_boundary() -> None:
    feature = read("tests/features/cstar_forge_codex_host_worker_handoff.feature")
    kernel = read("docs/integrations/cstar-kernel-mcp.md")
    start = kernel.index("### Current native Forge flat-dispatch boundary")
    end = kernel.index("\n## MCP 2026-07-28", start)
    native = " ".join(kernel[start:end].split())
    for term in (
        "consume:forge-host-handoff",
        "host_handoff_queued",
        "host_handoff_replayed",
        "no-follow",
        "ready_for_host_execution",
        "validation-ticket",
    ):
        assert term in feature
    assert "historical evidence only" in feature
    assert "current native execution never selects the consumer" in feature
    assert "generation-tombstoned evidence only" in native
    assert "never current, default, target, recovery, replacement, or fallback routes" in native


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
    assert "generation-tombstoned historical evidence only" in generator
    assert "Current Forge v3 host handoffs require" not in generator


def test_feature_preserves_v3_v2_and_independent_authority_boundaries() -> None:
    feature = read("tests/features/cstar_forge_codex_host_worker_handoff.feature")
    assert "Historical state-only Codex-host Forge handoff tombstone" in feature
    assert "Historical post-return Codex-host consumption" in feature
    assert "Historical protected effects and compatibility remain bounded" in feature
    assert "no CStar lifecycle or validation-ticket mutation" in feature
    assert "never selects this handoff as a current, default, target, recovery" in " ".join(feature.split())


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

    native_start = kernel.index("### Current native Forge flat-dispatch boundary")
    native_end = kernel.index("\n## MCP 2026-07-28", native_start)
    native = " ".join(kernel[native_start:native_end].split())
    for phrase in (
        "forge-native-codex-swarm-v1",
        "cstar_forge_swarm_plan",
        "cstar_forge_swarm_update",
        "cstar_forge_swarm_complete",
        "one to three useful direct workers",
        "disjoint write ownership",
        "DELIVERED_UNVERIFIED",
        "requested reasoning",
        "actual identity",
        "zero provider calls",
        "network requests",
        "spend",
        "generation-tombstoned evidence only",
        "install",
        "activation",
        "restart",
        "Git",
        "lifecycle",
    ):
        assert phrase in native
    for phrase in ("requested model", "requested reasoning", "actual identity", "unreported"):
        assert phrase in native
