# AutoBot public surface — decommissioned

This directory intentionally has no `SKILL.md`. AutoBot is not a discoverable
host skill, a registry capability, or an MCP tool. The former
`CSTAR_KERNEL_ENABLE_AUTOBOT` switch no longer enables anything.

The script filenames remain only as fail-closed tombstones for stale callers.
They do not read targets, enqueue work, invoke Hermes, spend, or write output.
The former implementation remains available through repository history for
forensics; it is not a runtime dependency of Corvus Forge.

Do not invoke these scripts directly, register this directory as a skill, or
expose it through an MCP or host surface. Live implementation is private to the receipt-bound
`cstar_forge_request -> cstar_forge_execute` path.
