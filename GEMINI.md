# Corvus Star

> Host-native Gemini CLI extension for the authoritative CStar runtime.

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
- Keep reasoning, planning, critique, and recovery in the host session when the registry marks a capability host-executable.
- Keep deterministic local primitives in the kernel; do not fork Gemini-specific capability definitions.
- Treat `native-session` and `exec-bridge` capabilities as host-routed, and treat `supported` capabilities as kernel-backed launch surfaces.

## Exported Gemini Capabilities (68)
- `_archive` (SKILL, native-session)
- `agentic-ingest` (PRIME, native-session)
- `annex` (SKILL, native-session)
- `autobot` (SKILL, supported)
- `bifrost` (SKILL, native-session)
- `bookmark-weaver` (SKILL, native-session)
- `cachebro` (SKILL, native-session)
- `calculus` (PRIME, native-session)
- `chant` (WEAVE, native-session)
- `chronicle` (SKILL, native-session)
- `consciousness` (SKILL, native-session)
- `contract_hardening` (WEAVE, native-session)

## Notes
- This extension is generated from the registry-backed distribution builder.
- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.
