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
- Run `./cstar hall "<query>"` from the CStar root before broad local scans, and quote only the relevant Hall hits back into context.
- Use `./cstar <command>` from the CStar root or `node bin/cstar.js <command>` as canonical launchers.
- Use `./cstar augury handoff --json` when resuming active planning/runtime state, then carry forward only the lead bead, gate, next action, target paths, and checker commands.
- Use `./cstar augury doctor --json` before acting when scope, route, expert, or Mimir targets look unclear.
- Use `./cstar augury explain --json` when you need the reason behind the selected route, scope, expert, and Mimir targets.
- Use `./cstar one-mind agents --json` and `./cstar one-mind events --bead <id> --json` only when coordination or active ownership matters.
- Keep host-specific packaging separate from kernel logic.
- Treat `native-session` and `exec-bridge` capabilities as host-routed work, and `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with forbidden kernel fallback must fail closed instead of dropping into legacy kernel cognition.
- Do not run shell `cstar chant` for host-only planning. In Codex, perform the host-native planning and critique in-session, using Hall/Augury state commands for bounded state and evidence.

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

## Context Budget
- Never preload Hall memory, logs, full registry dumps, or complete bead ledgers.
- Prefer one Hall query per mission, then narrower follow-up queries by bead id, target path, or error text.
- Summarize Hall results as current instructions only when they are OPEN/SET/PLAN_READY or explicitly match the user request. Treat logs and archived results as leads.
- Keep retrieved snippets to the minimum needed to choose files, commands, verification, and next action.

## Bead Workflow
1. Identify the mission and run a targeted `./cstar hall "<intent or bead id>"` query.
2. If an OPEN or SET bead matches, anchor work to that bead and inspect only its target paths plus directly adjacent files.
3. If no bead matches and the task is structural, use host-native planning in-session and record the intended Hall path in the response.
4. Before edits, state the bead/Augury anchor and the files you will touch.
5. After edits, run the checker from the bead when present; otherwise run the focused CStar or spoke test that matches the touched surface.
6. If CStar reports a live planning/runtime failure, triage it before returning to spoke work unless the user explicitly defers it.

## Silent Hook
- The plugin includes a PostToolUse hook that only refreshes a local stamp and captures a tiny Augury handoff compatibility payload in `/tmp`; it must stay silent and must not inject Hall payloads into Codex context.

## Exported Codex Capabilities (0)
- None exported.
