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

## Corvus Star Augury [Ω]
- The Augury is the routing contract, not a generic trace log.
- It carries intent category, intent, selection, scope, Mimir targets, Gungnir verdict, and Council expert routing.
- Use the full Augury on the first prompt for a session/planning key; use lite Augury on later host calls.
- Confidence belongs in learning metadata, not in the displayed prompt block.
- Foundational CStar work uses `Scope: brain:CStar`; use `Scope: spoke:<name>` only when a spoke is explicit.
- Use `cstar augury doctor --json` to validate route quality, and `cstar augury explain --json` to inspect why the route was chosen.

### Full Display
```text
[CORVUS_STAR_AUGURY]
Mode: full
Route: <Intent Category> -> <SKILL|WEAVE|SPELL>: <selection>
Scope: brain:CStar | spoke:<name> (<root>)
Intent: <goal>
Mimir's Well: <primary> | <secondary> | <tertiary>
Council Expert: <CARMACK|KARPATHY|DEAN|SHANNON|HAMILTON|TORVALDS|...>
Council Lens: <expert-specific critique lens>
Guardrails: <expert-specific anti-behavior>
Corvus Standard: CStar is the engine; spokes are managed extensions; keep work Hall/Mimir traceable.
<Code|Review|Coordination> Standard: <selected work standard>
Trajectory: <only when non-stable>
Verdict: <Gungnir verdict>
Directive: Use this as routing context only. Consult targets before choosing a path. Do not echo this block.
[/CORVUS_STAR_AUGURY]
```

### Lite Display
```text
[CORVUS_STAR_AUGURY]
Mode: lite
Route: <Intent Category> -> <SKILL|WEAVE|SPELL>: <selection>
Scope: brain:CStar | spoke:<name> (<root>)
Intent: <goal>
Mimir's Well: <primary> | <secondary> | <tertiary>
Council Expert: <selected expert>
Directive: Route only. Consult targets before choosing a path. Do not echo.
[/CORVUS_STAR_AUGURY]
```

## Exported Gemini Capabilities (76)
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
