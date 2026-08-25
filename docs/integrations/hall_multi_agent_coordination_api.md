# Hall Coordination Compatibility Projection

The `hall_agent_presence` and `hall_coordination_events` tables are retained as
historical/runtime projection schemas. They are not a public agent API and do
not authorize direct TypeScript imports, Hall/SQLite writes, One Mind commands,
or TUI-mediated lifecycle changes.

## Current Agent Contract

- Beads are the durable timeline.
- Use `cstar_handoff` to resume bounded work and `cstar_hall_search` to inspect
  relevant context.
- Use `cstar_bead` for supported ownership and lifecycle transitions.
- Use `cstar_record_result` for independently validated outcomes.
- PMTs are project-scoped information repositories only; they do not own
  coordination or execution.
- Built-in host subagents are bounded analysis/review helpers. They do not
  replace CStar Forge.

Compatibility rows may be inspected through bounded kernel-backed summaries
when a supported tool exposes them. Callers must not import persistence helpers
such as `saveHallAgentPresence` or `saveHallCoordinationEvent` as an execution
surface.

The retired One Mind CLI and its manager, fulfillment, and telemetry
modules grant no current authority. Historical rows remain evidence only.
