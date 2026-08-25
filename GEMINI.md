# Corvus Star

> Host-native Gemini CLI extension for the authoritative CStar runtime.

## Identity
- Package: `corvusstar` v1.0.1
- Persona: `O.D.I.N.`
- Repository: `git+https://github.com/Clinscott/CStar.git`

## Authority Order
- Platform/operator policy and nearest authority files govern. Current CStar lifecycle state follows within those gates.
- Registry/tool declarations define capability; runtime observations are evidence. Neither may create authority.
- Prefer `cstar-kernel` MCP surfaces before shell launchers or broad local scans.
- Use `cstar_bead` for bead lifecycle when it is available.

## Launcher Contract
- Use `cstar-kernel` MCP tools first for CStar control-plane work.
- `./cstar <command>`
- `node bin/cstar.js <command>`
- `./cstar hall "<query>"`

## Host Behavior
- Read the nearest `AGENTS.md` or `AGENTS.qmd` before making structural claims; those files own current role, topology, and operator-gate policy.
- Treat `docs/integrations/codex_mcp_contract.md` as the current Codex/CStar integration contract.
- Use `cstar_hall_search` for estate discovery before ad hoc search; use `./cstar hall "<query>"` only when MCP cannot provide the needed primitive.
- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.
- If the MCP surface is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.
- Follow the nearest authority file for ownership and operator gates instead of relying on generated copies of mutable estate topology.
- Keep reasoning, planning, critique, and recovery in the host session when the registry marks a capability host-executable.
- Keep deterministic local primitives in the kernel; do not fork Gemini-specific capability definitions.
- Treat `native-session` and `exec-bridge` capabilities as host-routed, and treat `supported` capabilities as kernel-backed launch surfaces.
- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.
- Public host fronts marked with kernel fallback forbidden must fail closed when no host session is active; they must not degrade into legacy kernel cognition.

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

## Exported Gemini Capabilities (3)
- `corvus-forge` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `cstar-closeout` (SKILL, native-session, host-workflow, kernel fallback allowed)
- `researcher` (SKILL, native-session, host-workflow, kernel fallback allowed)

## Notes
- This extension is generated from the registry-backed distribution builder.
- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.
- The `cstar-kernel` MCP server is wired up by `mcpServers` in `gemini-extension.json` — invoke kernel tools directly through MCP, not via shell, whenever the needed primitive exists.
