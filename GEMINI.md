# Corvus Star

> Host-native Gemini CLI extension for the authoritative CStar runtime.

## Identity
- Package: `corvusstar` v1.0.0
- Persona: `A.L.F.R.E.D.`
- Repository: `git+https://github.com/Clinscott/CStar.git`

## Authority Order
- Registry and runtime contracts outrank prose.
- Treat `.agents/skill_registry.json` as the capability source of truth.
- Prefer Hall discovery before broad local scans.

## Launcher Contract
- `./cstar <command>`
- `node bin/cstar.js <command>`
- `./cstar hall "<query>"`

## Host Behavior
- Read `AGENTS.qmd` at session start before making structural claims.
- Use `./cstar hall "<query>"` for estate discovery before ad hoc search.
- Keep reasoning, planning, critique, and recovery in the host session when the registry marks a capability host-executable.
- Keep deterministic local primitives in the kernel; do not fork Gemini-specific capability definitions.
- Treat `native-session` and `exec-bridge` capabilities as host-routed, and treat `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with kernel fallback forbidden must fail closed when no host session is active; they must not degrade into legacy kernel cognition.

## Exported Gemini Capabilities (75)
- `_archive` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `agent-browser` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `agentic-ingest` (PRIME, native-session, host-workflow, kernel fallback allowed)
- `annex` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `artifact-forge` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `autobot` (SKILL, supported, kernel-primitive, kernel fallback allowed)
- `bifrost` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `bookmark-weaver` (SKILL, supported, kernel-primitive, kernel fallback allowed)
- `cachebro` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `calculus` (PRIME, native-session, host-workflow, kernel fallback allowed)
- `chant` (WEAVE, native-session, host-workflow, kernel fallback forbidden)
- `chronicle` (SKILL, native-session, host-workflow, kernel fallback allowed)

## Notes
- This extension is generated from the registry-backed distribution builder.
- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.
## Host-Native Skill Mandate

Skills are harness skills, not shell commands.

- Do not run CStar skills through terminal dispatch (`cstar run-skill`, dynamic command fallback, shell wrappers, or script shims) unless the skill is explicitly marked terminal-required.
- `entry_surface: "cli"` is not terminal permission. Terminal execution requires `terminal_required: true`, `execution.requires_terminal: true`, or `execution.terminal_contract: "required"`.
- Use the host-native skill bridge/harness for agent-native and host-only skills. `chant` is a host-native skill/planning surface, not a shell workflow.
- Do not add shell scripts as skill entrypoints unless a terminal is intrinsically required. Prefer `SKILL.md` instructions, host workflow adapters, and harness-native activation.
- Verification should be bounded and harness-native. Broad scans or live terminal smoke tests require explicit user approval for the exact command.
- Canonical bridge contract: `docs/host-native-skill-bridge.md`.
