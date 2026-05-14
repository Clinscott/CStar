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

## Kernel MCP Tools (20)

The `cstar-kernel` MCP server is the authoritative kernel surface — invoke these tools directly via MCP rather than shelling out to `./cstar`. Every handler is deterministic; no LLM inference in the tool execution path. Full API reference: `docs/integrations/cstar-kernel-mcp.md`.

- `cstar_handoff` — Compact active state from Augury/handoff logic.
- `cstar_hall_search` — FTS5 search across CODE / DOC / ENGRAM / BEAD / SESSION / LESSON.
- `cstar_hall_maintenance` — Engram lesson study / harvest queue.
- `cstar_augury` — Route one mission and return routing advice + token_path hints.
- `cstar_doctor` — Kernel diagnostics: registry, augury, database checks + telemetry summary.
- `cstar_verify_plan` — Recommended checker shells + last validation verdict for the active bead.
- `cstar_bead` — Bead lifecycle: get / list / create / update_status / claim / resolve / block.
- `cstar_spoke_bead_import` — Import a rich bead from a registered spoke into the hub Hall.
- `cstar_record_result` — Record a bead result / verdict; auto-link recent token-path advice.
- `cstar_engram_record` — Record an episodic memory entry.
- `cstar_war_game_score` — War-game scoring: register / tally / recent / by_scenario / get_score.
- `cstar_manifest` — Capability discovery (hub registry + spoke-local manifests, announce-only).
- `cstar_skill_info` — Per-capability contract: <slug>:<id> for spoke skills, bare id for hub.
- `cstar_spoke_journal` — Four-file journal state for a registered spoke (memory/tasks/wireframe/DEV_JOURNAL).
- `cstar_status` — Deterministic framework snapshot: status, persona, gungnir score, spokes, agents, hall_reachable.
- `cstar_evolve` — Read-only inspection of evolve proposals + SPRT history (no LLM-driven propose/promote).
- `cstar_spoke` — Mounted-spoke lifecycle: list / link / unlink / inspect.
- `cstar_intent_route` — Resolve a prompt against the intent grammar; action=match (first hit) or explain (all hits).
- `cstar_warden` — Sentinel Wardens: list / bounties (tech_debt_ledger) / scan (Python warden on demand).
- `cstar_telemetry` — MCP telemetry summaries: usage counts, outcome rates, token-path integration.

## Exported Gemini Capabilities (0)
- None exported.

## Notes
- This extension is generated from the registry-backed distribution builder.
- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.
- The `cstar-kernel` MCP server is wired up by `mcpServers` in `gemini-extension.json` — invoke kernel tools directly through MCP, not via shell.
