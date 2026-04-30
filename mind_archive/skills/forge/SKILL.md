---
name: forge
description: "Use when translating lore fragments into staged code artifacts through the Taliesin Forge pipeline."
risk: safe
source: internal
---

# 🔱 TALIESIN FORGE SKILL (v1.0)

## When to Use
- Use when translating lore fragments into staged code artifacts through the Taliesin Forge pipeline.


## MANDATE
Translate high-fidelity canonical inputs into staged Code Artifacts through a host-supervised forge front that strictly adheres to the Linscott Standard.

## LOGIC PROTOCOL
1. **CANONICAL INTAKE**: Resolve the bead-backed or canonical forge request and reject freeform lore as execution authority.
2. **HOST REASONING**: Let the host session own candidate shaping, rationale, and artifact intent.
3. **ARTIFACT WEAVING**: Generate the structured candidate envelope for the bounded TALIESIN executor.
4. **STAGING**: Materialize the code into `.agents/forge_staged/` as a non-authoritative review artifact and emit a structured staging envelope.

## CONSTRAINTS
- Output MUST be valid JSON.
- Never output Markdown wrappers or chat filler.
- All code must include comprehensive docstrings and strict typing.
- Public forge reasoning belongs to the host session; local runtime execution is the bounded staging primitive, not the public mind.
- `.agents/forge_staged/` is staging only. Promotion still requires Hall, sovereign beads, and validation.

## USAGE
`cstar forge --lore <path> [--objective <override>]`
