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
- Authoritative integration contract: `docs/integrations/codex_mcp_contract.md`.

## Required Behavior
- Read only the specific CStar authority files needed for the task. Start with the nearest `AGENTS.md` or `AGENTS.qmd`, then `.agents/skill_registry.json`, before architectural claims.
- Current role, topology, ownership, and operator-gate policy come from the nearest authority file; this generated skill deliberately does not duplicate that mutable policy.
- CStar is canonical for Corvus planning, proposals, execution state, validation, and completion; do not use direct Hall/SQLite writes when kernel primitives exist.
- Prefer `cstar-kernel` MCP tools first for CStar control-plane work: `cstar_doctor`, `cstar_handoff`, `cstar_augury`, `cstar_hall_search`, `cstar_verify_plan`, `cstar_bead`, and `cstar_record_result` where exposed.
- Use `cstar_hall_search` before broad local scans, and quote only the relevant Hall hits back into context.
- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.
- If MCP is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.
- Use `./cstar <command>` from the CStar root or `node bin/cstar.js <command>` only when MCP cannot provide the needed primitive or the capability is explicitly terminal-required.
- Use `cstar_handoff` when resuming active planning/runtime state, then carry forward only the lead bead, gate, next action, target paths, and checker commands.
- Use `cstar_doctor` when kernel health is unknown or a current probe reports degradation.
- Use `cstar_augury` only when route or material scope is ambiguous; it explains a route but grants no authority.
- Use direct Codex thread tools for read/list/send when exposed; session JSONL fallback is read-only degraded mode, not an execution or assignment surface.
- Keep high-volume collectors outside beads; collectors write receipts or artifacts, then bounded proposals/results enter CStar.
- Public AutoBot routing is decommissioned. Refer to Hermes/MiniMax only for the private durable Forge request/execute adapter; direct Hermes and Codex-subagent implementation routes are forbidden.
- Keep host-specific packaging separate from kernel logic.
- Treat `native-session` and `exec-bridge` capabilities as host-routed work, and `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with forbidden kernel fallback must fail closed instead of dropping into legacy kernel cognition.
- Do not run shell `cstar chant` for host-only planning. In Codex, perform the host-native planning and critique in-session, using Hall/Augury state commands for bounded state and evidence.

## Corvus Star Augury [Ω]
- Augury is a read-only typed route explanation, not permission and not a generic trace ritual.
- Use it at a new or ambiguous route or material scope change; reuse fresh mission state otherwise.
- Council experts are advisory critique lenses, not votes, owners, authority, or proof.
- TokenPath is quarantined; it must not advise, steer, emit confidence, or accept observation writes until independently promoted.
- Do not echo a full Augury block unless the operator asks for the route packet.
- Foundational CStar work uses `Scope: brain:CStar`; use `Scope: spoke:<name>` only when a spoke is explicit.

## Kernel MCP Tools (25)

The `cstar-kernel` MCP server is the authoritative kernel surface — invoke these tools directly via MCP rather than shelling out to `./cstar` whenever the needed primitive exists. Live Forge uses durable request/attempt rows, one-shot operator attestation, atomic reservation, exact request/package/output locks, and idempotent replay. Adapter delivery remains pending until independent validation. Tool classification, request shape, or a caller-supplied reference is not authority proof. An already-running host must reload repaired source before changes are live. Full API reference: `docs/integrations/cstar-kernel-mcp.md`.

- `cstar_hall_maintenance` (LEGACY) — Decommissioned lesson study/harvest compatibility surface; always fails closed without reading or writing Hall state.
- `cstar_handoff` (READ) — Return compact active state from Augury/handoff logic.
- `cstar_hall_search` (READ) — Bounded Hall search across code/docs/engrams/beads/sessions/lessons.
- `cstar_augury` (READ) — Resolve a mission to a route with deterministic grammar, active session context, council expert, Mimir targets, and persona advice.
- `cstar_doctor` (READ) — Diagnose base kernel health and active Augury health.
- `cstar_verify_plan` (READ) — Recommend focused checks; do not run them.
- `cstar_bead` (MUTATION) — Create, inspect, claim, block, resolve, and list bounded Hall beads. RESOLVED transitions are gated by the Sterling Mandate unless force/exemption evidence is supplied.
- `cstar_spoke_bead_import` (MUTATION) — Import a spoke-originated bead into the Hall through a bounded, validated handoff payload.
- `cstar_record_result` (MUTATION) — Record independent validation for a Hall bead and optionally finalize a delivered Forge receipt; TokenPath observation input remains quarantined.
- `cstar_engram_record` (MUTATION) — Publish an Engram to the Hall episodic memory table and fire war-game scoring when applicable.
- `cstar_war_game_score` (MUTATION) — War-game scoring: register_contest, tally, recent, by_scenario, get_score, list_contests.
- `cstar_manifest` (READ) — Capability discovery. Returns the kernel registry merged with spoke-local skill manifests.
- `cstar_skill_info` (READ) — Per-capability contract view for hub and namespaced spoke skills.
- `cstar_spoke_journal` (READ) — Four-file journal state for a registered spoke.
- `cstar_pennyone_context` (READ) — Bounded PennyOne/Hall state summaries. No arbitrary SQL is accepted.
- `cstar_mongo_mailbox` (MUTATION) — Mongo mailbox status/counts. Durable operator-intent enqueue authority is unavailable and fails closed; no arbitrary Mongo query is accepted.
- `cstar_status` (READ) — Deterministic kernel state snapshot.
- `cstar_evolve` (READ) — Read-only inspection of Karpathy-loop artifacts: list_proposals, get_proposal, list_sprt_history.
- `cstar_spoke` (MUTATION) — Mounted-spoke lifecycle: list / link / unlink / inspect / project / doctor / prune / verify / health.
- `cstar_intent_route` (READ) — Deterministic grammar-only routing. Prefer cstar_augury when session context is needed.
- `cstar_warden` (READ) — On-demand Sentinel Warden invocation. Deterministic scanners only; no LLM inference.
- `cstar_telemetry` (READ) — Read-only MCP telemetry summaries over the last 24h.
- `cstar_researcher_request` (REQUEST) — Create a CStar-native no-spend Researcher request receipt.
- `cstar_forge_request` (REQUEST) — Persist an immutable no-spend Forge request; live authorization binds a one-shot operator attestation and exact output contract.
- `cstar_forge_execute` (EXECUTION) — Atomically reserve and invoke the private Hermes/MiniMax adapter once, with durable replay and delivered-pending-validation semantics.

## Context Budget
- Never preload Hall memory, logs, full registry dumps, or complete bead ledgers.
- Use at most one broad Hall query when discovery genuinely needs it, then narrow by bead id, target path, or error text.
- Summarize Hall results as current instructions only when they are OPEN/SET/PLAN_READY or explicitly match the user request. Treat logs and archived results as leads.
- Keep retrieved snippets to the minimum needed to choose files, commands, verification, and next action.

## Bead Workflow
1. Resume a known bead with `cstar_handoff`; use bounded Hall discovery only when its identity is unknown.
2. If an OPEN or SET bead matches, anchor work to that bead and inspect only its target paths plus directly adjacent files.
3. If no bead matches and the task changes Corvus state, create or propose the bounded lifecycle record before implementation.
4. Use Augury only for ambiguous route or material scope; do not make it a per-edit ritual.
5. After edits, run the checker from the bead when present; otherwise run the focused CStar or spoke test that matches the touched surface.
6. Record meaningful validation and closeout through CStar; a package, callback, or model claim is evidence rather than lifecycle state.

## Registry-Exported Codex Capabilities
- This list is generated from `.agents/skill_registry.json` and may be empty when no Codex executable capabilities are registered.
- `corvus-forge` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `cstar-closeout` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `researcher` (SKILL, native-session, host-workflow, kernel fallback allowed)
