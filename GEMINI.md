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
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with kernel fallback forbidden must fail closed when no host session is active; they must not degrade into legacy kernel cognition.

## Exported Gemini Capabilities (72)
- `_archive` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `agentic-ingest` (PRIME, native-session, host-workflow, kernel fallback allowed)
- `annex` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `artifact-forge` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `autobot` (SKILL, supported, kernel-primitive, kernel fallback allowed)
- `bifrost` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `bookmark-weaver` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `cachebro` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `calculus` (PRIME, native-session, host-workflow, kernel fallback allowed)
- `chant` (WEAVE, native-session, host-workflow, kernel fallback forbidden)
- `chronicle` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `consciousness` (SKILL, native-session, host-workflow, kernel fallback allowed)

## Notes
- This extension is generated from the registry-backed distribution builder.
- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.
