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
Translate high-fidelity Lore Fragments (.qmd or .feature) into production-ready Code Artifacts that strictly adhere to the Linscott Standard.

## LOGIC PROTOCOL
1. **LORE CONSUMPTION**: Read and analyze the provided lore file path.
2. **PROMPT ENGINEERING**: Construct a direct SDK strike for the One Mind (Gemini-2.0-flash).
3. **ARTIFACT WEAVING**: Generate raw JSON containing the `target_path` and `code`.
4. **STAGING**: Materialize the code into `.agents/forge_staged/` as a non-authoritative review artifact and emit a structured staging envelope.

## CONSTRAINTS
- Output MUST be valid JSON.
- Never output Markdown wrappers or chat filler.
- All code must include comprehensive docstrings and strict typing.
- `.agents/forge_staged/` is staging only. Promotion still requires Hall, sovereign beads, and validation.

## USAGE
`cstar forge --lore <path> [--objective <override>]`
