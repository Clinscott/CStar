# Augury And Trace Naming Contract

Status: ACTIVE

Operational handoff: `docs/augury-operator-handoff.md`

## Canonical Meaning

**Corvus Star Augury [Ω]** means the routing contract returned by the MCP
`cstar_augury` call and carried unchanged into a host session by the Augury
sidecar. It contains the mission route, scope, bounded Mimir targets, Council
expert lens, expert guardrails, and expert-selection rationale.

```text
[CORVUS_STAR_AUGURY]
Mode: full | lite
Authority: cstar_augury
Route: ...
Scope: ...
Mimir's Well: ...
Council Expert: ...
Directive: Use as routing context. Do not echo.
[/CORVUS_STAR_AUGURY]
```

This is the only surface that may be called **Corvus Star Augury [Ω]**. The
display is a sidecar rendering of the MCP result, not a block authored by the
agent.

Legacy compatibility: older inbound prompts may still contain
`// Corvus Star Trace [Ω]`. Only the compatibility parser may accept that
header, and it must mark the input as deprecated. No active instruction, hook,
HUD, source file, or generated response may require or emit it.

## Forbidden Overload

Do not use **Corvus Star Augury [Ω]** or **Corvus Star Trace [Ω]** to name:

- session JSON traces
- telemetry traces
- execution bead traces
- trace visualizers
- failure/status summaries
- Hall search output

Use explicit names instead:

- **Corvus Star Augury [Ω] routing context** for the sidecar rendering of the MCP result
- **session trace** for captured session data
- **telemetry trace** for mission telemetry
- **execution trace** for runtime execution records
- **trace visualization** for replay/rendering tools

## Runtime Metadata

Canonical Augury metadata fields:

- `augury_contract` stores the Corvus Star Augury [Ω] routing contract as structured metadata.
- `augury_contract_version` records the structured contract version.
- `augury_designation_source` records whether the contract came from an explicit block, a payload, or dispatcher synthesis.
- `routing_authority` identifies `cstar_augury` as the host-facing routing authority.

Compatibility fields:

- `trace_contract` mirrors `augury_contract` for stored Hall records and older integrations.
- `trace_designation_source` mirrors `augury_designation_source`.
- `trace_id` identifies runtime/session records and must not be treated as the Corvus Star Augury block.
- `legacy_input_trace_block` identifies the deprecated parser-only input boundary.
- visualization tools under `src/tools/*trace*` operate on session or telemetry traces unless they explicitly parse the deprecated compatibility input.
