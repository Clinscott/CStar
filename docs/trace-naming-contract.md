# Augury And Trace Naming Contract

Status: ACTIVE

Operational handoff: `docs/augury-operator-handoff.md`

## Canonical Meaning

**Corvus Star Augury [Ω]** means the selection/designation block that explains an agentic turn:

```text
// Corvus Star Augury [Ω]
Intent Category: ...
Intent: ...
Selection: ...
Mimir's Well: ...
Gungnir Verdict: ...
Confidence: ...
```

This is the only surface that may be called **Corvus Star Augury [Ω]**.

Legacy compatibility: older inputs may still contain `// Corvus Star Trace [Ω]`. The parser may accept that header while the Estate migrates, but new content must emit `// Corvus Star Augury [Ω]`.

## Forbidden Overload

Do not use **Corvus Star Augury [Ω]** or **Corvus Star Trace [Ω]** to name:

- session JSON traces
- telemetry traces
- execution bead traces
- trace visualizers
- failure/status summaries
- Hall search output

Use explicit names instead:

- **Corvus Star Augury [Ω] selection block** for the intent/designation block
- **session trace** for captured session data
- **telemetry trace** for mission telemetry
- **execution trace** for runtime execution records
- **trace visualization** for replay/rendering tools

## Runtime Metadata

Canonical Augury metadata fields:

- `augury_contract` stores the Corvus Star Augury [Ω] selection block as structured metadata.
- `augury_contract_version` records the structured contract version.
- `augury_designation_source` records whether the contract came from an explicit block, a payload, or dispatcher synthesis.

Compatibility fields:

- `trace_contract` mirrors `augury_contract` for stored Hall records and older integrations.
- `trace_designation_source` mirrors `augury_designation_source`.
- `trace_id` identifies runtime/session records and must not be treated as the Corvus Star Augury block.
- visualization tools under `src/tools/*trace*` operate on session or telemetry traces unless they explicitly parse the Corvus Star Augury [Ω] header.
