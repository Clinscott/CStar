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
    - '\\bcstar\\s+(hall|augury|status|manifest|evolve)\\b'
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
- Use `cstar_handoff` when resuming, `cstar_doctor` when kernel health is unknown, advisory `cstar_augury` when route or material scope is ambiguous, and mission-boundary Augury once for a new exact SET/design.
- Use direct Codex thread tools for read/list/send when exposed; session JSONL fallback is read-only degraded mode, not an execution or assignment surface.
- CoS owns estate sequencing, bounded Green/Yellow execution, evidence packaging, lifecycle updates, and closeout.
- CoS owns no host goal; every substantive assignment is sent to a Luna Max worker/workthread that owns exactly one bounded host goal and returns its local status as evidence.
- Before the first CStar mutation or provider attempt of each local day, follow `docs/operations/cstar-goal-driven-daily-bootstrap.md` for Codex/Hermes freshness; updates do not authorize a restart.
- Forge builds implementation; Researcher gathers evidence; CorvusEye evaluates and red-teams.
- PMTs are project-scoped information repositories only. Query only the mapped PMT for bounded context and send a compact state update after meaningful work.
- MM is legacy and has no active estate-routing role.
- Preserve operator gates for acceptance, dispatch, implementation bypass, commit, push, merge, post, deletion, restarts, deploys, and secret/config mutation.
- Keep high-volume collectors outside beads; collectors write receipts or artifacts, then bounded proposals/results enter CStar.
- Public AutoBot is decommissioned. Forge alone may use its private CStar -> Hermes -> MiniMax-M3 adapter after an authorized execute transition.
- Choose Luna, Terra, or Sol only through a host surface that exposes an enforceable selector. Record requested and actual identity separately; use `unreported` when actual identity is absent.
- Keep host-specific packaging separate from kernel logic.
- Treat `native-session` and `exec-bridge` capabilities as host-routed work, and `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with forbidden kernel fallback must fail closed instead of dropping into legacy kernel cognition.
- This Codex plugin is skill-only. It bundles neither MCP servers nor hooks; the independently managed host-global CStar kernel supplies tools.
- Persona is non-authoritative process guidance. Read only `cstar_status.persona`; use O.D.I.N. for build-run-repair and A.L.F.R.E.D. for secure-harden, without changing scope, authority, or gates.
- Do not run shell `cstar chant` for host-only planning. In Codex, perform the host-native planning and critique in-session, using Hall/Augury state commands for bounded state and evidence.

## CStar and CoS Delegation Boundary
- CStar is only the deterministic state manager; it records bounded lifecycle state, receipts, validation, and completion, but does not launch agents, workthreads, providers, or cognition.
- CoS in Codex is the orchestrator and supervisor/delegator: it sequences CStar state, dispatches owning workers, reviews returned evidence, requests correction, records independent validation, resolves beads, and closes out.
- CoS must not implement, research, debug, edit source, run worker tests or validation, or silently take over failed worker work.
- CoS owns no host goal and must never create, resume, update, pause, block, complete, or close a host goal.
- Every substantive implementation, research, debug, or validation assignment goes to a Luna Max worker/workthread that owns exactly one bounded host goal.
- The worker-goal objective binds the exact CStar bead id, decision, target paths, and checker contract; host-goal status is worker-local evidence, never CStar lifecycle truth.
- Recoverable correction stays in the same retained workthread and same goal; a replacement worker gets a new goal plus an explicit bounded CStar handoff and never inherits hidden goal state.
- A distinct validator owns a distinct validation goal and never reuses the implementation goal; legacy CoS-held goals stay paused/historical until supported transfer and are never silently resumed or falsely completed.
- CStar has no generic host-goal or worker-launcher surface; `cstar_goal_resume`, when exposed, records continuity only and does not mutate a host goal or launch a worker.
- A `workthread` is a retained/resumable host-issued worker thread with stable lineage; it is not a CStar kernel/provider launcher, and no runtime support is claimed unless the host exposes it.
- Every substantive direct Codex subagent and retained/resumable workthread requests `gpt-5.6-luna` with reasoning effort `max` through an enforceable host selector.
- Record `requested_model`, `requested_reasoning`, `selector_status`, and `actual_identity` separately; use `actual_identity: unreported` when the host reports no actual identity.
- Selector absence or mismatch is visible; never silently fall back to another model, reasoning effort, provider, or surface.
- Augury is the exception: request `gpt-5.6-sol` at `max` for the first opinion and distinct `gpt-5.6-terra` at `max` for a needed second opinion, still through an enforceable selector.
- This contract defines no numeric concurrency cap.

## Corvus Star Augury [Ω]
- Augury is mode-dependent: omitting `mission_boundary` is a read-only typed route explanation; supplying it materializes one new current exact SET/design mission.
- New SET/design work uses one strict `cstar_augury` mission boundary, preferring v2 with v1 compatibility, then `cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> independent cstar_record_result -> automatic next-child advancement`.
- Eligible child Forge requests may receive internal request-scoped SET evidence automatically, but `cstar_forge_authorize` remains the explicit no-spend authorization gate for the default operator lifecycle.
- Neither Augury mode grants permission, ownership, a vote, provider spend, or validation authority.
- Use advisory Augury only when route or material scope is ambiguous; reuse fresh mission state otherwise.
- CoS Augury model policy: request `gpt-5.6-sol` at max reasoning for the primary advisory call; when a second opinion is needed, make a distinct `gpt-5.6-terra` call at max reasoning. Use only a host surface with an enforceable selector, record requested versus actual identity, and grant no authority, spend, retries, or scope through this preference.
- Council experts are advisory critique lenses. They cannot authorize work or turn synthetic evidence into proof.
- TokenPath is quarantined. It cannot advise, steer, emit confidence, or accept observation writes until independently promoted.
- Omit numeric confidence unless an independently validated scorer supplies a nonzero denominator, exclusions, class coverage, formula, row evidence, and provenance.
- Foundational CStar work uses `Scope: brain:CStar`; use `Scope: spoke:<name>` only when a spoke is explicit.
- Do not echo a full Augury block unless the operator asks for the route packet.

## Kernel MCP Tools (28)

The `cstar-kernel` MCP server is the authoritative kernel surface — invoke these tools directly via MCP rather than shelling out to `./cstar` whenever the needed primitive exists. Tool classes declare bounded effects; observed runtime remains evidence and cannot grant authority. Full API reference: `docs/integrations/cstar-kernel-mcp.md`.
The default profile exposes exactly 16 tools. Advanced adds 9; full compatibility adds the remaining 3 legacy surfaces and exposes all 28.

- `cstar_hall_maintenance` (LEGACY; compatibility) — Decommissioned lesson study/harvest compatibility surface; always fails closed without reading or writing Hall state.
- `cstar_handoff` (READ; default) — Return compact active state from Augury/handoff logic.
- `cstar_hall_search` (READ; default) — Bounded Hall search across code/docs/engrams/beads/sessions/lessons.
- `cstar_augury` (MUTATION; default) — Resolve a mission route and optionally materialize one strict v1/v2 exact-SET design boundary; omission of mission_boundary is read-only.
- `cstar_doctor` (READ; default) — Diagnose base kernel health and active Augury health.
- `cstar_verify_plan` (READ; default) — Recommend focused checks; do not run them.
- `cstar_bead` (MUTATION; default) — Create, inspect, claim, block, resolve, and list bounded Hall beads. RESOLVED requires fresh contained Lore/Isolation artifacts bound to an exact independent Hall validation receipt; no scalar, cached, force, or exemption bypass exists.
- `cstar_goal_resume` (MUTATION; default) — Append immutable continuity evidence for an explicitly resumed blocked host goal. It does not change host state or grant spend, source, Git, restart, deployment, or production authority.
- `cstar_spoke_bead_import` (MUTATION; advanced) — Import a spoke-originated bead into the Hall through a bounded, validated handoff payload.
- `cstar_record_result` (MUTATION; default) — Record independent validation for a Hall bead and optionally finalize a delivered Forge receipt.
- `cstar_engram_record` (MUTATION; advanced) — Publish an Engram to the Hall episodic memory table and fire war-game scoring when applicable.
- `cstar_war_game_score` (MUTATION; advanced) — War-game scoring: register_contest, tally, recent, by_scenario, get_score, list_contests.
- `cstar_manifest` (READ; default) — Capability discovery. Returns the kernel registry merged with spoke-local skill manifests.
- `cstar_skill_info` (READ; default) — Per-capability contract view for hub and namespaced spoke skills.
- `cstar_spoke_journal` (READ; advanced) — Four-file journal state for a registered spoke.
- `cstar_pennyone_context` (READ; advanced) — Bounded PennyOne/Hall state summaries. No arbitrary SQL is accepted.
- `cstar_mongo_mailbox` (LEGACY; compatibility) — Decommissioned Mongo mirror/intent compatibility surface; always fails closed without secret, network, or write activity.
- `cstar_status` (READ; default) — Deterministic kernel state snapshot with optional exact Forge execution lifecycle status.
- `cstar_persona_set` (MUTATION; default) — Explicitly select O.D.I.N. or A.L.F.R.E.D. for the next workflow boundary; style-only and never expands authority or bypasses gates.
- `cstar_evolve` (READ; advanced) — Read-only inspection of Karpathy-loop artifacts: list_proposals, get_proposal, list_sprt_history.
- `cstar_spoke` (READ; advanced) — Redacted mounted-spoke inspection and exact-match prune preview; link, unlink, project, and destructive prune fail closed until a request-scoped operator-attestation contract exists.
- `cstar_intent_route` (READ; compatibility) — Legacy grammar-only compatibility projection; active routing uses cstar_augury.
- `cstar_warden` (EXECUTION; advanced) — On-demand local Sentinel Warden execution. list and bounties are read-only; scan starts a constrained project-venv process and performs no LLM inference.
- `cstar_telemetry` (READ; advanced) — Read-only MCP telemetry summaries over the last 24h.
- `cstar_researcher_request` (REQUEST; default) — Create a CStar-native no-spend Researcher request receipt.
- `cstar_forge_request` (REQUEST; default) — Persist an immutable Forge request and derive a request-scoped receipt from an active exact-SET mission grant when eligible.
- `cstar_forge_authorize` (MUTATION; default) — Bind one explicit root-user build instruction or immutable SET authority to an unchanged pending Forge request; performs no provider call.
- `cstar_forge_execute` (EXECUTION; default) — Atomically run one provider attempt through the private Hermes/MiniMax adapter, with durable replay, independently validated pre-provider continuity, and delivered-pending-validation semantics.

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
- `researcher` (SKILL, native-session, host-workflow, kernel fallback forbidden)
