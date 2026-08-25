"""Retirement and isolation contracts for the former public AutoBot lane.

These tests intentionally do not import or execute historical AutoBot code.
Unregistered compatibility files are not runtime authority.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_cstar_autobot_is_absent_and_disabled_from_public_runtime() -> None:
    classes = _read("src/tools/cstar-kernel-mcp/contracts/tool_classes.ts")
    catalog = _read("src/tools/cstar-kernel-mcp/contracts/tool_catalog.ts")
    registration = _read("src/tools/cstar-kernel-mcp/register_core_tools.ts")
    bootstrap = _read("src/tools/cstar-kernel-mcp.ts")
    latent_handler = _read("src/tools/cstar-kernel-mcp/tools/autobot.ts")

    assert "cstar_autobot" not in classes
    assert "name: 'cstar_autobot'" not in catalog
    assert "cstar_autobot" not in registration
    assert "cstar_autobot" not in bootstrap
    assert "registerCoreTools(server, instrumentTool)" in bootstrap
    assert "cstar_autobot is decommissioned" in latent_handler
    assert "spawnAsync" not in latent_handler
    assert "delegate.py" not in latent_handler
    assert "CSTAR_KERNEL_ENABLE_AUTOBOT" not in latent_handler


def test_active_skill_registry_contains_no_autobot_entry_or_route() -> None:
    registry = json.loads(_read(".agents/skill_registry.json"))

    assert "autobot" not in registry["entries"]
    assert all(
        "autobot" not in str(category.get("default_path", "")).lower()
        for category in registry["intent_grammar"].values()
    )
    assert all(
        "autobot" not in json.dumps(entry).lower()
        for entry in registry["entries"].values()
    )


def test_durable_forge_is_the_only_registered_implementation_lane() -> None:
    registry = json.loads(_read(".agents/skill_registry.json"))
    build_route = registry["intent_grammar"]["BUILD"]
    repair_route = registry["intent_grammar"]["REPAIR"]
    forge = registry["entries"]["corvus-forge"]
    catalog = _read("src/tools/cstar-kernel-mcp/contracts/tool_catalog.ts")
    contract = _read("docs/integrations/host_native_skill_contract.md")

    assert build_route["default_path"] == "cstar_forge_request"
    assert repair_route["default_path"] == "cstar_forge_request"
    assert forge["viability"] == "ACTIVE"
    assert forge["entry_surface"] == "host-only"
    assert "name: 'cstar_forge_request'" in catalog
    assert "name: 'cstar_forge_execute'" in catalog
    flat = " ".join(contract.split())
    assert "cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute" in flat
    assert "cstar_forge_swarm_plan -> direct host-native workers" in flat
    assert "cstar_forge_swarm_complete -> DELIVERED_UNVERIFIED" in flat
    assert "forge-native-codex-swarm-v1" in flat
    assert "one to three useful direct workers" in flat
    assert "no descendants, one attempt" in flat


def test_retirement_contract_forbids_environment_reactivation() -> None:
    integration = _read("docs/integrations/cstar-kernel-mcp.md")
    flat = " ".join(integration.split())

    assert "`cstar_autobot` is decommissioned" in flat
    assert "No environment variable reactivates it." in flat
    assert "Codex-host state-only handoff" in flat
    assert "historical, legacy, retired, or generation-tombstoned evidence" in flat
    assert "never current, default, target, recovery, replacement, or fallback routes" in flat
