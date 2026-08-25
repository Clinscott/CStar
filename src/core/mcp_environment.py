"""Fail-closed environment boundary for deterministic CStar MCP children."""

from __future__ import annotations

import os
from collections.abc import MutableMapping


KERNEL_MCP_INACTIVE_HOST_ENV: dict[str, str] = {
    "GEMINI_CLI_ACTIVE": "false",
    "GEMINI_CLI": "0",
    "GEMINI_CLI_SUBAGENTS": "false",
    "CODEX_SHELL": "0",
    "CODEX_THREAD_ID": "",
    "CODEX_SUBAGENTS": "false",
    "CLAUDE_CLI_ACTIVE": "false",
    "CLAUDECODE": "",
    "CLAUDE_SUBAGENTS": "false",
    "DROID_CLI_ACTIVE": "false",
    "CORVUS_HOST_PROVIDER": "",
    "AGENT_MODE": "headless",
    "CORVUS_HOST_SESSION_ACTIVE": "0",
}

# Intentionally explicit: unknown CODEX_* values may be sandbox/security
# constraints and must not be erased merely because they share a host prefix.
KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS: tuple[str, ...] = (
    "CODEX_CI",
    "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
    "CODEX_MANAGED_BY_NPM",
    "CODEX_MANAGED_PACKAGE_ROOT",
    "CODEX_SQLITE_HOME",
)


def neutralize_kernel_mcp_environment(
    target_env: MutableMapping[str, str] | None = None,
) -> MutableMapping[str, str]:
    """Scrub passive Codex state and seed explicit inactive host authority."""
    env = os.environ if target_env is None else target_env

    for key in KERNEL_MCP_SCRUBBED_HOST_ENV_KEYS:
        env.pop(key, None)

    env.update(KERNEL_MCP_INACTIVE_HOST_ENV)
    env["CSTAR_KERNEL_MCP"] = "1"
    env["CSTAR_KERNEL_DISABLE_WATCH"] = "1"
    return env
