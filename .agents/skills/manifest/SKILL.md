---
name: manifest
description: "Use when listing registered Agent Skills and runtime Weaves, or inspecting the mandate of a specific skill."
risk: safe
source: internal
---

# 🔱 MANIFEST SKILL (v1.0)

## When to Use
- Use to see all available capabilities in the Corvus Star ecosystem.
- Use to read the mandate, protocol, and usage instructions for a specific skill.

## MANDATE
Maintain and expose the authoritative registry of all agentic capabilities.

## LOGIC PROTOCOL
1. **MANIFEST LOOKUP**: Read the `skill_registry.json` from the `.agents` directory.
2. **RUNTIME SYNC**: Query the `RuntimeDispatcher` to identify which skills have active weave adapters.
3. **CONTRACT RESOLUTION**: Prefer weave or spell contract docs when they exist, and fall back to the skill shell or runtime authority path.
4. **STATUS RENDERING**: Display capabilities with their entry surface, invocation path, and runtime activation state.

## USAGE
`cstar manifest`
`cstar manifest --json`
`cstar skill-info <id>`
`cstar skill-info <id> --json`

## API NOTES
- `manifest --json` is the machine-readable capability catalog.
- `skill-info --json` is the machine-readable per-capability contract view.
- `entry_surface` distinguishes shell-dispatchable capabilities from host-only or compatibility surfaces.
- `shell_command` is the recommended operator invocation. If absent, the capability is not intended for direct shell execution.
- `invoke` carries structured shell metadata such as aliases, options, subcommands, and JSON support when the command is backed by a registered Commander surface.
