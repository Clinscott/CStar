---
name: corvus-star
description: "Use when operating inside the Corvus Star estate so Codex follows the CStar authority order, Hall discovery path, and launcher contract."
metadata:
  priority: 5
  pathPatterns:
    - 'CStar/**'
    - 'AGENTS.md'
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
- Read only the specific CStar authority files needed for the task. Start with the applicable global and nearest-repository `AGENTS.md`, then use the registry only for declared capabilities.
- CStar is canonical for Corvus planning, proposals, execution state, validation, and completion; do not use direct Hall/SQLite writes when kernel primitives exist.
- Prefer `cstar-kernel` MCP tools first for CStar control-plane work: `cstar_doctor`, `cstar_handoff`, `cstar_augury`, `cstar_hall_search`, `cstar_verify_plan`, `cstar_bead`, `cstar_goal_resume`, and `cstar_record_result` where exposed.
- Use `cstar_hall_search` before broad local scans, and quote only the relevant Hall hits back into context.
- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.
- If MCP is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.
- Use `./cstar <command>` from the CStar root or `node bin/cstar.js <command>` only when MCP cannot provide the needed primitive or the capability is explicitly terminal-required.
- Use `cstar_handoff` when resuming active planning/runtime state, then carry forward only the lead bead, gate, next action, target paths, and checker commands.
- Use `cstar_handoff` when resuming, `cstar_doctor` when kernel health is unknown, and `cstar_augury` only when route or material scope is ambiguous.
- Use direct Codex thread tools for read/list/send when exposed; session JSONL fallback is read-only degraded mode, not an execution or assignment surface.
- CoS owns estate sequencing, bounded Green/Yellow execution, evidence packaging, lifecycle updates, and closeout.
- Start or resume one host goal for every non-trivial mission, keep one plan step in progress, and close the goal only after CStar lifecycle state and validation agree.
- Before the first CStar mutation or provider attempt of each local day, follow `docs/operations/cstar-goal-driven-daily-bootstrap.md` for Codex-host and explicitly selected legacy-adapter freshness; updates do not authorize a restart.
- Forge builds implementation; Researcher gathers evidence; CorvusEye evaluates and red-teams.
- PMTs are project-scoped information repositories only. Query only the mapped PMT for bounded context and send a compact state update after meaningful work.
- MM is inactive and has no active routing, synthesis, ownership, relay, review, or execution role.
- Preserve operator gates for acceptance, dispatch, implementation bypass, commit, push, merge, post, deletion, restarts, deploys, and secret/config mutation.
- Keep high-volume collectors outside beads; collectors write receipts or artifacts, then bounded proposals/results enter CStar.
- Public AutoBot is decommissioned. Current Forge v3 persists a Codex-host state-only handoff; private Hermes/MiniMax adapters remain explicit legacy v2 compatibility and are never a fallback.
- After `host_handoff_queued` or `host_handoff_replayed`, run `npm run consume:forge-host-handoff` with the exact returned handoff path, hash, request, execution, attempt, and target-scope fields before exposing executable job data. The read-only consumer fails closed on unsafe filesystem or binding drift and leaves lifecycle, ticket, provider, and cleanup state untouched.
- The consumer receipt means only `ready_for_host_execution` at a sequential filesystem boundary; it does not claim validation, Forge finalization, host execution, or filesystem-wide atomicity across the final identity check and later opens.
- Choose Luna, Terra, or Sol only through a host surface that exposes an enforceable selector. Record requested and actual identity separately; use `unreported` when actual identity is absent.
- Keep host-specific packaging separate from kernel logic.
- Treat `native-session` and `exec-bridge` capabilities as host-routed work, and `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with forbidden kernel fallback must fail closed instead of dropping into legacy kernel cognition.
- This Codex plugin is skill-only. It bundles neither MCP servers nor hooks; the independently managed host-global CStar kernel supplies tools.
- Persona is non-authoritative process guidance. Read only `cstar_status.persona`; use O.D.I.N. for build-run-repair and A.L.F.R.E.D. for secure-harden, without changing scope, authority, or gates.
- Do not run shell `cstar chant` for host-only planning. In Codex, perform the host-native planning and critique in-session, using Hall/Augury state commands for bounded state and evidence.

## Corvus Star Augury [Ω]
- Augury is a read-only typed route explanation, not permission, ownership, a vote, or a generic trace ritual.
- Use `cstar_augury` only when route or material scope is ambiguous; reuse fresh mission state otherwise.
- Council experts are advisory critique lenses. They cannot authorize work or turn synthetic evidence into proof.
- TokenPath is quarantined. It cannot advise, steer, emit confidence, or accept observation writes until independently promoted.
- Omit numeric confidence unless an independently validated scorer supplies a nonzero denominator, exclusions, class coverage, formula, row evidence, and provenance.
- Foundational CStar work uses `Scope: brain:CStar`; use `Scope: spoke:<name>` only when a spoke is explicit.
- Do not echo a full Augury block unless the operator asks for the route packet.

## Kernel MCP Tools (30)

The `cstar-kernel` MCP server is the authoritative kernel surface — invoke these tools directly via MCP rather than shelling out to `./cstar` whenever the needed primitive exists. Tool classes declare bounded effects; observed runtime remains evidence and cannot grant authority. Full API reference: `docs/integrations/cstar-kernel-mcp.md`.

- `cstar_hall_maintenance` (LEGACY) — Decommissioned lesson study/harvest compatibility surface; always fails closed without reading or writing Hall state.
- `cstar_handoff` (READ) — Return compact active state from Augury/handoff logic.
- `cstar_hall_search` (READ) — Bounded Hall search across code/docs/engrams/beads/sessions/lessons.
- `cstar_augury` (READ) — Resolve a mission to a route with deterministic grammar, active session context, council expert, Mimir targets, and persona advice.
- `cstar_doctor` (READ) — Diagnose base kernel health and active Augury health.
- `cstar_verify_plan` (READ) — Recommend focused checks; do not run them.
- `cstar_bead` (MUTATION) — Create, inspect, claim, block, resolve, and list bounded Hall beads. RESOLVED requires fresh contained Lore/Isolation artifacts bound to an exact independent Hall validation receipt; no scalar, cached, force, or exemption bypass exists.
- `cstar_goal_resume` (MUTATION) — Append immutable continuity evidence for an explicitly resumed blocked host goal. It does not change host state or grant spend, source, Git, restart, deployment, or production authority.
- `cstar_spoke_bead_import` (MUTATION) — Import a spoke-originated bead into the Hall through a bounded, validated handoff payload.
- `cstar_record_result` (MUTATION) — Record independent validation for a Hall bead and optionally finalize a delivered Forge receipt.
- `cstar_engram_record` (MUTATION) — Publish an Engram to the Hall episodic memory table and fire war-game scoring when applicable.
- `cstar_war_game_score` (MUTATION) — War-game scoring: register_contest, tally, recent, by_scenario, get_score, list_contests.
- `cstar_manifest` (READ) — Capability discovery. Returns the kernel registry merged with spoke-local skill manifests.
- `cstar_skill_info` (READ) — Per-capability contract view for hub and namespaced spoke skills.
- `cstar_spoke_journal` (READ) — Four-file journal state for a registered spoke.
- `cstar_pennyone_context` (READ) — Bounded PennyOne/Hall state summaries. No arbitrary SQL is accepted.
- `cstar_mongo_mailbox` (LEGACY) — Decommissioned Mongo mirror/intent compatibility surface; always fails closed without secret, network, or write activity.
- `cstar_status` (READ) — Deterministic kernel state snapshot with optional exact Forge execution lifecycle status.
- `cstar_persona_set` (MUTATION) — Explicitly select O.D.I.N. or A.L.F.R.E.D. for the next workflow boundary; style-only and never expands authority or bypasses gates.
- `cstar_evolve` (READ) — Read-only inspection of Karpathy-loop artifacts: list_proposals, get_proposal, list_sprt_history.
- `cstar_spoke` (READ) — Redacted mounted-spoke inspection and exact-match prune preview; link, unlink, project, and destructive prune fail closed until a request-scoped operator-attestation contract exists.
- `cstar_intent_route` (READ) — Deterministic grammar-only routing. Prefer cstar_augury when session context is needed.
- `cstar_warden` (EXECUTION) — On-demand local Sentinel Warden execution. list and bounties are read-only; scan starts a constrained project-venv process and performs no LLM inference.
- `cstar_telemetry` (READ) — Read-only MCP telemetry summaries over the last 24h.
- `cstar_researcher_request` (REQUEST) — Create a CStar-native no-spend Researcher request receipt.
- `cstar_forge_request` (REQUEST) — Persist an immutable no-spend Forge request; machine challenge material stays hidden from the normal operator workflow.
- `cstar_forge_authorize` (MUTATION) — Bind one explicit root-user build instruction or immutable CStar goal-continuation receipt to one unchanged pending Forge request; performs no provider call.
- `cstar_forge_execute` (EXECUTION) — Atomically persist or replay the current Codex-host state-only Forge handoff with zero CStar provider/cognition launch; explicitly selected legacy Hermes/MiniMax attempts retain durable replay, independently validated continuity, and delivered-pending-validation semantics.
- `cstar_mission` (REQUEST) — Compatibility-first ordinary bounded mission coordinator; derives immutable identifiers and hashes, persists host-owned queue intent when authorized, and never launches workers, providers, or Forge authority.
- `cstar_forge_host_complete` (MUTATION) — Record a host-reported Forge completion boundary without treating delivery as independent validation or lifecycle success.

## Context Budget
- Never preload Hall memory, logs, full registry dumps, or complete bead ledgers.
- Use at most one broad Hall query when discovery genuinely needs it, then narrow by bead id, target path, or error text.
- Summarize Hall results as current instructions only when they are OPEN/SET/PLAN_READY or explicitly match the user request. Treat logs and archived results as leads.
- Keep retrieved snippets to the minimum needed to choose files, commands, verification, and next action.

## Bead Workflow
1. Resume a known bead with `cstar_handoff`; use bounded Hall discovery only when its identity is unknown.
2. If an OPEN or SET bead matches, anchor work to that bead and inspect only its target paths plus directly adjacent files.
3. If no bead matches and the task is structural, create or propose the bounded bead through `cstar_bead` before implementation.
4. Use Augury only for ambiguous route or material scope; do not make it a per-edit ritual.
5. After edits, run the checker from the bead when present; otherwise run the focused CStar or spoke test that matches the touched surface.
6. Record meaningful validation and closeout through CStar; a package, callback, or model claim is evidence rather than lifecycle state.

## Registry-Exported Codex Capabilities
- This list is generated from `.agents/skill_registry.json` and may be empty when no Codex executable capabilities are registered.
- `corvus-forge` (SKILL, native-session, host-workflow, kernel fallback forbidden)
- `cstar-closeout` (SKILL, native-session, host-workflow, kernel fallback forbidden)
- `cstar-reliability-loop` (SKILL, native-session, host-workflow, kernel fallback forbidden)
- `researcher` (SKILL, native-session, host-workflow, kernel fallback forbidden)
