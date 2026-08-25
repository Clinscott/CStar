# CStar Repository Router

CStar is the Corvus estate control plane. Apply platform/operator safety and
global Corvus instructions first. This file contains repository deltas only.

## Invariants

- Use `cstar-kernel` for lifecycle state. Never bypass an available kernel path
  with direct Hall/SQLite writes or ad hoc state files.
- Registries and observed runtime are evidence, not authority. Beads and
  receipts are the durable timeline for lifecycle state.
- CoS coordinates. Forge implements. Researcher researches. CorvusEye or a
  distinct validator evaluates. PMTs are project-scoped information repositories only.
  MM is inactive and has no active routing, synthesis, ownership, relay, review,
  or execution role.
- Ordinary Forge and Researcher use is coordinator-decided; preserve ordinary
  operator language instead of requiring robot-language prompts.
- Preserve explicit gates for spend, sources, retry, scope, Git, restart,
  activation, deployment, secrets/config, destructive action, and production.
- Pause for live workers or external state. Do not poll or duplicate a provider
  attempt.

## Situation router

Follow [`.agents/AGENTS.feature`](.agents/AGENTS.feature). One situation selects
one narrow surface and one canonical runbook. The Forge route is always
`request -> authorize -> execute -> independent record_result`.
Daily freshness follows `docs/operations/cstar-goal-driven-daily-bootstrap.md`.

## Repository deltas

- `CODE_ROOT` owns executable/source material; `CONTROL_ROOT` owns Hall state,
  receipts, and execution artifacts. Never substitute one for the other.
- Keep `src/tools/cstar-kernel-mcp.ts` as bootstrap/exports. Put behavior in
  focused modules under `src/tools/cstar-kernel-mcp/`.
- No touched production or focused-test source file may exceed 500 lines.
- Reusable behavior is skill-first, then MCP. Define bounded inputs, outputs,
  failures, receipts, and tests before promotion.
- Every change needs Lore, focused Isolation, and evidence-backed Audit.
  Never invent a Gungnir score or production claim.
- Select persona explicitly with `cstar_persona_set` at a workflow boundary;
  read it with `cstar_status`. Persona changes process posture, never authority.
- Never read or print `.agents/config.json`; use the bounded `cstar_status`
  projection for persona state.
- Run focused checks and `npm run typecheck` in the worktree that changed.

`AGENTS.qmd` is a compatibility pointer only. Detailed procedures belong in
the runbooks selected by the Gherkin router, not in agent instruction files.
