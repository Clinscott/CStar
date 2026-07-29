---
name: corvus-star
description: "Use when operating inside the Corvus Star estate so Codex follows the CStar authority order, Hall discovery path, and launcher contract."
metadata:
  priority: 5
  pathPatterns:
    - 'CStar/**'
    - 'AGENTS.md'
    - 'AGENTS.qmd'
    - 'BIDE_INTEGRATION_GUIDE.md'
    - '.agents/skill_registry.json'
  bashPatterns:
    - '\\bcstar\\s+(hall|augury|trace|one-mind|status|manifest|evolve|orchestrate)\\b'
    - '\\bnode\\s+bin/cstar\\.js\\s+'
  promptSignals:
    phrases:
      - "CStar"
      - "Corvus"
      - "Hall of Records"
      - "bead"
      - "Mimir"
      - "Mimir's Well"
      - "Gungnir"
      - "Augury"
      - "Council of Experts"
---

# Corvus Star Plugin

## When to Use
- Use when the workspace is the Corvus estate or a Corvus spoke.
- Use when Codex should route discovery and execution through CStar instead of ad hoc scripts.

## Required Behavior
- Read only the specific CStar authority files needed for the task. Start with `AGENTS.qmd` and `.agents/skill_registry.json` before architectural claims.
- CStar is canonical for Corvus planning, proposals, execution state, validation, and completion; do not use direct Hall/SQLite writes when kernel primitives exist.
- Prefer `cstar-kernel` MCP tools first for CStar control-plane work: `cstar_doctor`, `cstar_handoff`, `cstar_augury`, `cstar_hall_search`, `cstar_verify_plan`, `cstar_bead`, and `cstar_record_result` where exposed.
- Use `cstar_hall_search` before broad local scans, and quote only the relevant Hall hits back into context.
- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.
- If MCP is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.
- Use `./cstar <command>` from the CStar root or `node bin/cstar.js <command>` only when MCP cannot provide the needed primitive or the capability is explicitly terminal-required.
- Use `cstar_handoff` when resuming active planning/runtime state, then carry forward only the lead bead, gate, next action, target paths, and checker commands.
- Use `cstar_doctor` before acting when scope, route, expert, or Mimir targets look unclear.
- Use `cstar_augury` when you need the reason behind the selected route, scope, expert, and Mimir targets.
- Treat the returned `cstar_augury` payload as the only host-facing routing authority. Sidecars and host prompts may transport or compact it, but must not recompute its route or Council expert.
- Use direct Codex thread tools for read/list/send when exposed; session JSONL fallback is read-only degraded mode, not an execution or assignment surface.
- CoS is CEO-facing coordination: visibility, priorities, risks, and approval asks. CoS does not directly implement project work by default.
- Route execution through CoS -> Corvus - MM -> one pinned PMT per project -> fresh workers.
- PMT owns worker assignment and project execution tracking; MM owns thread architecture and routing.
- Treat the Researcher thread as a special monitored pipeline, not a normal PMT worker.
- Preserve operator gates for acceptance, dispatch, implementation bypass, commit, push, merge, post, deletion, restarts, deploys, and secret/config mutation.
- Keep high-volume collectors outside beads; collectors write receipts or artifacts, then bounded proposals/results enter CStar.
- Avoid active AutoBot/Hermes routing language unless explicitly marked historical or decommissioned.
- Keep host-specific packaging separate from kernel logic.
- Treat `native-session` and `exec-bridge` capabilities as host-routed work, and `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with forbidden kernel fallback must fail closed instead of dropping into legacy kernel cognition.
- Do not run shell `cstar chant` for host-only planning. In Codex, perform the host-native planning and critique in-session, using Hall/Augury state commands for bounded state and evidence.

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

## Context Budget
- Never preload Hall memory, logs, full registry dumps, or complete bead ledgers.
- Prefer one Hall query per mission, then narrower follow-up queries by bead id, target path, or error text.
- Summarize Hall results as current instructions only when they are OPEN/SET/PLAN_READY or explicitly match the user request. Treat logs and archived results as leads.
- Keep retrieved snippets to the minimum needed to choose files, commands, verification, and next action.

## Bead Workflow
1. Identify the mission and run a targeted `cstar_hall_search` query.
2. If an OPEN or SET bead matches, anchor work to that bead and inspect only its target paths plus directly adjacent files.
3. If no bead matches and the task is structural, use host-native planning in-session and record the intended Hall path in the response.
4. Before edits, state the bead/Augury anchor and the files you will touch.
5. After edits, run the checker from the bead when present; otherwise run the focused CStar or spoke test that matches the touched surface.
6. If CStar reports a live planning/runtime failure, triage it before returning to spoke work unless the user explicitly defers it.

## Silent Hook
- The plugin includes a PostToolUse hook that only refreshes a local stamp and captures a tiny Augury handoff compatibility payload in `/tmp`; it must stay silent and must not inject Hall payloads into Codex context.

## Registry-Exported Codex Capabilities
- This list is generated from `.agents/skill_registry.json` and may be empty when no Codex executable capabilities are registered.
- `calculus` (PRIME, supported, kernel-primitive, kernel fallback allowed)
