# Corvus Star

> Host-native Gemini CLI extension for the authoritative CStar runtime.

## Identity
- Package: `corvusstar` v1.0.1
- Persona: read only the bounded `cstar_status.persona` projection at runtime; omit it when unavailable.
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
- Use `cstar_doctor` when health is unknown, `cstar_handoff` when resuming, `cstar_augury` when route or scope is ambiguous, and at most one broad `cstar_hall_search` before narrowing.
- Use `./cstar hall "<query>"` only when MCP cannot provide the needed primitive and terminal use is explicitly allowed.
- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.
- Use `cstar_goal_resume` only for an explicit root-user continuation signal when the host lacks a blocked-to-active transition; it records continuity and does not mutate host state or grant new authority.
- If the MCP surface is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.
- CoS coordinates estate sequencing and bounded Green/Yellow execution. Forge builds implementation; Researcher gathers evidence through authorized lanes.
- Start or resume one host goal for every non-trivial mission, keep one plan step in progress, and close the goal only after CStar lifecycle state and validation agree.
- Before the first CStar mutation or provider attempt of each local day, follow `docs/operations/cstar-goal-driven-daily-bootstrap.md` for Codex/Hermes freshness; updates do not authorize a restart.
- PMTs are project-scoped information repositories only, and MM has no active routing role.
- Preserve operator gates for acceptance, dispatch, commit, push, merge, deletion, restarts, and publish actions.
- Keep reasoning, planning, critique, and recovery in the host session when the registry marks a capability host-executable.
- Keep deterministic local primitives in the kernel; do not fork Gemini-specific capability definitions.
- Treat `native-session` and `exec-bridge` capabilities as host-routed, and treat `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with kernel fallback forbidden must fail closed when no host session is active; they must not degrade into legacy kernel cognition.
- Persona is style-only. Read only the bounded persona projection returned by `cstar_status`; omit persona context when unavailable.

## Corvus Star Augury [Ω]
- Augury is a read-only typed route explanation, not permission, ownership, a vote, or a generic trace ritual.
- Use `cstar_augury` only when route or material scope is ambiguous; reuse fresh mission state otherwise.
- Council experts are advisory critique lenses. They cannot authorize work or turn synthetic evidence into proof.
- TokenPath is quarantined. It cannot advise, steer, emit confidence, or accept observation writes until independently promoted.
- Omit numeric confidence unless an independently validated scorer supplies a nonzero denominator, exclusions, class coverage, formula, row evidence, and provenance.
- Foundational CStar work uses `Scope: brain:CStar`; use `Scope: spoke:<name>` only when a spoke is explicit.
- Do not echo a full Augury block unless the operator asks for the route packet.

## Kernel MCP Tools (27)

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
- `cstar_status` (READ) — Deterministic kernel state snapshot.
- `cstar_evolve` (READ) — Read-only inspection of Karpathy-loop artifacts: list_proposals, get_proposal, list_sprt_history.
- `cstar_spoke` (READ) — Redacted mounted-spoke inspection and exact-match prune preview; link, unlink, project, and destructive prune fail closed until a request-scoped operator-attestation contract exists.
- `cstar_intent_route` (READ) — Deterministic grammar-only routing. Prefer cstar_augury when session context is needed.
- `cstar_warden` (EXECUTION) — On-demand local Sentinel Warden execution. list and bounties are read-only; scan starts a constrained project-venv process and performs no LLM inference.
- `cstar_telemetry` (READ) — Read-only MCP telemetry summaries over the last 24h.
- `cstar_researcher_request` (REQUEST) — Create a CStar-native no-spend Researcher request receipt.
- `cstar_forge_request` (REQUEST) — Persist an immutable no-spend Forge request and return its exact hash-bound authorization challenge.
- `cstar_forge_authorize` (MUTATION) — Authorize one unchanged pending Forge request from an exact sole-input root-user hash challenge; performs no provider call.
- `cstar_forge_execute` (EXECUTION) — Atomically reserve and invoke the private Hermes/MiniMax adapter once, with durable replay and delivered-pending-validation semantics.

## Exported Gemini Capabilities (3)
- `corvus-forge` (SKILL, native-session, host-workflow, kernel fallback forbidden)
- `cstar-closeout` (SKILL, native-session, host-workflow, kernel fallback forbidden)
- `researcher` (SKILL, native-session, host-workflow, kernel fallback forbidden)

## Notes
- This extension is generated from the registry-backed distribution builder.
- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.
- The `cstar-kernel` MCP server is wired up by `mcpServers` in `gemini-extension.json` — invoke kernel tools directly through MCP, not via shell, whenever the needed primitive exists.
