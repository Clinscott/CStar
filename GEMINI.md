# Corvus Star

> Host-native Gemini CLI extension for the authoritative CStar runtime.

## Identity
- Package: `corvusstar` v1.0.1
- Persona: read only `cstar_status.persona`; apply O.D.I.N. as build-run-repair and A.L.F.R.E.D. as secure-harden guidance without changing authority or operator gates.
- Repository: `git+https://github.com/Clinscott/CStar.git`

## Authority Order
- Apply platform safety and the current operator grant first, then the applicable global and nearest-repository `AGENTS.md`, repository runbooks, and current CStar lifecycle state.
- Registries declare capabilities and observed runtime is evidence. Neither can grant authority or weaken a gate.
- Prefer `cstar-kernel` MCP surfaces before shell launchers or broad local scans.
- Use `cstar_bead` for bead lifecycle when it is available.

## Launcher Contract
- Use `cstar-kernel` MCP tools first for CStar control-plane work.
- `./cstar <command>`
- `node bin/cstar.js <command>`
- `./cstar hall "<query>"`

## Host Behavior
- Read the applicable global and nearest-repository `AGENTS.md` before making structural claims.
- Use `cstar_doctor` when health is unknown, `cstar_handoff` when resuming, advisory `cstar_augury` when route or scope is ambiguous, and at most one broad `cstar_hall_search` before narrowing.
- Use `./cstar hall "<query>"` only when MCP cannot provide the needed primitive and terminal use is explicitly allowed.
- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.
- Use `cstar_goal_resume` only for an explicit root-user continuation signal when the host lacks a blocked-to-active transition; it records continuity and does not mutate host state or grant new authority.
- If the MCP surface is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.
- CoS coordinates estate sequencing and bounded Green/Yellow execution. Forge builds implementation; Researcher gathers evidence through authorized lanes.
- CoS owns no host goal; every substantive assignment is sent to a Luna Max worker/workthread that owns exactly one bounded host goal and returns its local status as evidence.
- Before the first CStar mutation or provider attempt of each local day, follow `docs/operations/cstar-goal-driven-daily-bootstrap.md` for Codex/Hermes freshness; updates do not authorize a restart.
- PMTs are project-scoped information repositories only, and MM has no active routing role.
- Preserve operator gates for acceptance, dispatch, commit, push, merge, deletion, restarts, and publish actions.
- Keep reasoning, planning, critique, and recovery in the host session when the registry marks a capability host-executable.
- Keep deterministic local primitives in the kernel; do not fork Gemini-specific capability definitions.
- Treat `native-session` and `exec-bridge` capabilities as host-routed, and treat `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with kernel fallback forbidden must fail closed when no host session is active; they must not degrade into legacy kernel cognition.
- Persona is non-authoritative process guidance. Read only `cstar_status.persona`; O.D.I.N. means build-run-repair and A.L.F.R.E.D. means secure-harden. Omit it when unavailable.

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

## Exported Gemini Capabilities (3)
- `corvus-forge` (SKILL, native-session, host-workflow, kernel fallback forbidden)
- `cstar-closeout` (SKILL, native-session, host-workflow, kernel fallback forbidden)
- `researcher` (SKILL, native-session, host-workflow, kernel fallback forbidden)

## Notes
- This extension is generated from the registry-backed distribution builder.
- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.
- The `cstar-kernel` MCP server is wired up by `mcpServers` in `gemini-extension.json` — invoke kernel tools directly through MCP, not via shell, whenever the needed primitive exists.
