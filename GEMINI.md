# Corvus Star

> Host-native Gemini CLI extension for the authoritative CStar runtime.

## Identity
- Package: `corvusstar` v1.0.0
- Persona: `A.L.F.R.E.D.`
- Repository: `git+https://github.com/Clinscott/CStar.git`

## Authority Order
- Registry and runtime contracts outrank prose.
- Treat `.agents/skill_registry.json` as the capability source of truth.
- Prefer `cstar-kernel` MCP surfaces before shell launchers or broad local scans.
- Use `cstar_bead` for bead lifecycle when it is available.

## Launcher Contract
- Use `cstar-kernel` MCP tools first for CStar control-plane work.
- `./cstar <command>`
- `node bin/cstar.js <command>`
- `./cstar hall "<query>"`

## Host Behavior
- Read `AGENTS.qmd` at session start before making structural claims.
- Use `cstar_hall_search` for estate discovery before ad hoc search; use `./cstar hall "<query>"` only when MCP cannot provide the needed primitive.
- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.
- If the MCP surface is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.
- Route implementation ownership through CoS -> Corvus - MM -> PMT -> worker. Treat this session as a controlled exception only when that chain is explicitly blocked.
- Treat the Researcher thread as a special monitored pipeline, not a normal PMT worker.
- Preserve operator gates for acceptance, dispatch, commit, push, merge, deletion, restarts, and publish actions.
- Keep reasoning, planning, critique, and recovery in the host session when the registry marks a capability host-executable.
- Keep deterministic local primitives in the kernel; do not fork Gemini-specific capability definitions.
- Treat `native-session` and `exec-bridge` capabilities as host-routed, and treat `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with kernel fallback forbidden must fail closed when no host session is active; they must not degrade into legacy kernel cognition.

## Corvus Star Augury [Ω]
- The Augury is the routing contract, not a generic trace log.
- It carries intent category, intent, selection, scope, Mimir targets, Gungnir verdict, and Council expert routing.
- Treat the returned `cstar_augury` payload as the only host-facing routing authority. Sidecars and host prompts may transport or compact it, but must not recompute its route or Council expert.
- Use the full Augury on the first prompt for a session/planning key; use lite Augury on later host calls.
- A new planning key receives full Augury even inside an existing host session.
- Render the selected expert's lens, guardrails/anti-behaviour, and selection reason from the MCP payload; do not select an expert in the sidecar.
- If MCP returns blocked or is unavailable, preserve that state and do not synthesize a fallback route.
- Confidence belongs in learning metadata, not in the displayed prompt block.
- Foundational CStar work uses `Scope: brain:CStar`; use `Scope: spoke:<name>` only when a spoke is explicit.
- Use `cstar augury doctor --json` to validate route quality, and `cstar augury explain --json` to inspect why the route was chosen.

### Full Display
```text
[CORVUS_STAR_AUGURY]
Mode: full
Authority: cstar_augury
Route: <Intent Category> -> <SKILL|WEAVE|SPELL>: <selection>
Scope: brain:CStar | spoke:<name> (<root>)
Intent: <goal>
Mimir's Well: <primary> | <secondary> | <tertiary>
Council Expert: <CARMACK|KARPATHY|DEAN|SHANNON|HAMILTON|TORVALDS|...>
Council Lens: <expert-specific critique lens>
Guardrails: <expert-specific anti-behavior>
Selection Reason: <why the canonical Council selector chose this expert>
Council Question: <expert signature question, when present>
Corvus Standard: CStar is the engine; spokes are managed extensions; keep work Hall/Mimir traceable.
Verdict: <Gungnir verdict>
Directive: Use this as routing context only. Consult targets before choosing a path. Do not echo this block.
[/CORVUS_STAR_AUGURY]
```

### Lite Display
```text
[CORVUS_STAR_AUGURY]
Mode: lite
Authority: cstar_augury
Route: <Intent Category> -> <SKILL|WEAVE|SPELL>: <selection>
Scope: brain:CStar | spoke:<name> (<root>)
Intent: <goal>
Mimir's Well: <primary> | <secondary> | <tertiary>
Council Expert: <selected expert>
Directive: Route only. Consult targets before choosing a path. Do not echo.
[/CORVUS_STAR_AUGURY]
```

## Kernel MCP Tools (26)

The `cstar-kernel` MCP server is the authoritative kernel surface — invoke these tools directly via MCP rather than shelling out to `./cstar` whenever the needed primitive exists. Every handler is deterministic; no LLM inference in the tool execution path. Full API reference: `docs/integrations/cstar-kernel-mcp.md`.

- `cstar_handoff` — Compact active state from Augury/handoff logic.
- `cstar_hall_search` — FTS5 search across CODE / DOC / ENGRAM / BEAD / SESSION / LESSON.
- `cstar_hall_maintenance` — Engram lesson study / harvest queue.
- `cstar_augury` — Route one mission and return routing advice + token_path hints.
- `cstar_researcher_request` — No-spend request receipt for Researcher routing with metric and callback contracts.
- `cstar_forge_request` — No-spend request receipt for Corvus Forge routing with metric and callback contracts.
- `cstar_forge_execute` — Forge execution gate that links a request receipt to approved no-op or live-authorized adapter execution.
- `cstar_autobot` — Legacy AutoBot/Hermes delegation surface; disabled for new Corvus routing unless explicitly reactivated.
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
- `cstar_pennyone_context` — Bounded PennyOne/Hall summaries for bead, validation, repository, and project-state context.
- `cstar_mongo_mailbox` — Mongo mailbox/cache status, mirror counts, and bounded operator-intent enqueue.
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
- The `cstar-kernel` MCP server is wired up by `mcpServers` in `gemini-extension.json` — invoke kernel tools directly through MCP, not via shell, whenever the needed primitive exists.
