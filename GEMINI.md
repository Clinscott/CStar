# Corvus Star

> Kernel-first Gemini CLI extension for the authoritative CStar runtime.

## Identity
- Package: `corvusstar` v1.0.0
- Persona: `O.D.I.N.`
- Repository: `git+https://github.com/Clinscott/CStar.git`

## Authority Order
- Registry and runtime contracts outrank prose.
- Treat `.agents/skill_registry.json` as the capability source of truth.
- Prefer Hall discovery before broad local scans.

## Launcher Contract
- `./cstar <command>`
- `node bin/cstar.js <command>`
- `./cstar hall "<query>"`
- `./cstar chant "<query>"`

## Host Behavior
- Read `AGENTS.qmd` at session start before making structural claims.
- Use `./cstar hall "<query>"` for estate discovery before ad hoc search.
- Keep runtime logic in the kernel; do not fork Gemini-specific capability definitions.

## Exported Gemini Capabilities (67)
- `_archive` (SKILL)
- `agentic-ingest` (PRIME)
- `annex` (SKILL)
- `autobot` (SKILL)
- `bifrost` (SKILL)
- `bookmark-weaver` (SKILL)
- `cachebro` (SKILL)
- `calculus` (PRIME)
- `chant` (WEAVE)
- `chronicle` (SKILL)
- `consciousness` (SKILL)
- `contract_hardening` (WEAVE)

## Notes
- This extension is generated from the registry-backed distribution builder.
- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.
